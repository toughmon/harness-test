"""Audit the built article site and execute its downloadable SQL without a browser.

This does not verify visual layout or emulate MySQL-specific behavior.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
from collections import Counter
import json
import re
import sqlite3
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
SLUGS = ['ecommerce-erd-guide', 'normalization-guide', 'identifying-vs-non-identifying',
         'barker-vs-ie-notation', 'column-naming-convention', 'erd-antipatterns',
         'surrogate-vs-natural-key', 'data-model-levels']
passed = 0


def check(label, condition):
    global passed
    assert condition, label
    passed += 1
    print('PASS:', label)


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.ids = []
        self.links = []
        self.resources = []
        self.alternates = {}
        self.canonical = None
        self.language = None
        self.headings = 0
        self.in_schema = False
        self.schemas = []
        self.schema = ''
        self.text = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.append(a['id'])
        if tag == 'html':
            self.language = a.get('lang')
        if tag == 'h1':
            self.headings += 1
        if tag == 'a':
            self.links.append(a.get('href', ''))
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href')
        if tag == 'link' and a.get('rel') == 'alternate':
            self.alternates[a.get('hreflang')] = a.get('href')
        if tag in ('link', 'script', 'img'):
            resource = a.get('src') or (a.get('href') if a.get('rel') in ('stylesheet', 'icon') else None)
            if resource:
                self.resources.append(resource)
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.in_schema = True
            self.schema = ''

    def handle_data(self, data):
        if self.in_schema:
            self.schema += data
        else:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.in_schema:
            self.schemas.append(json.loads(self.schema))
            self.in_schema = False


def file_for(path):
    clean = unquote(urlsplit(path).path)
    if clean == '/':
        return DIST / 'index.html'
    candidate = DIST / clean.lstrip('/')
    if candidate.is_dir():
        return candidate / 'index.html'
    return candidate


sitemap = ET.fromstring((DIST / 'sitemap.xml').read_text())
urls = [n.text for n in sitemap.findall('{*}url/{*}loc')]
check('sitemap has unique URLs', len(urls) == len(set(urls)))
check('all 36 sitemap pages exist in build', len(urls) == 36 and all(file_for(u).is_file() for u in urls))
documents = {urlsplit(u).path: Document(file_for(u).read_text()) for u in urls}
all_links = []
for path, document in documents.items():
    for href in document.links + document.resources:
        parsed = urlsplit(href)
        if parsed.netloc and parsed.netloc != 'yourerd.com':
            continue
        if parsed.scheme in ('mailto', 'tel'):
            continue
        target = parsed.path or path
        if target.startswith(('/app', '/d/', '/api/')):
            continue
        all_links.append((path, href))
        assert file_for(target).is_file(), (path, href, 'missing file')
        if parsed.fragment and target in documents:
            assert parsed.fragment in documents[target].ids, (path, href, 'missing anchor')
check('all public navigation links, fragments and local assets resolve', bool(all_links))

for lang, prefix in [('ko', ''), ('en', '/en')]:
    index = documents[prefix + '/articles/']
    check(lang + ' article cards link to eight separate guides',
          all(prefix + '/articles/' + slug + '.html' in index.links for slug in SLUGS))
    check(lang + ' navigation-only index has no advertising script',
          'adsbygoogle.js' not in file_for(prefix + '/articles/').read_text())
    for slug in SLUGS:
        path = prefix + '/articles/' + slug + '.html'
        source = file_for(path).read_text()
        doc = documents[path]
        check(path + ' has the correct language and one heading', doc.language == lang and doc.headings == 1)
        check(path + ' has canonical and reciprocal language alternates',
              doc.canonical == 'https://yourerd.com' + path and
              doc.alternates.get('ko') == 'https://yourerd.com/articles/' + slug + '.html' and
              doc.alternates.get('en') == 'https://yourerd.com/en/articles/' + slug + '.html')
        check(path + ' has unique section IDs', all(n == 1 for n in Counter(doc.ids).values()))
        check(path + ' contains a SQL example and case exercise', '<pre><code>' in source and
              (('worked-example' in doc.ids and 'verification' in doc.ids) if lang == 'en' else 'class="practice"' in source))
        check(path + ' has matching Article metadata', any(s.get('@type') == 'Article' and
              s.get('mainEntityOfPage') == 'https://yourerd.com' + path and s.get('dateModified') == '2026-09-28' for s in doc.schemas))
        check(path + ' avoids ignored MySQL inline references', not re.search(
              r'^\s*\w+\s+(?:BIGINT|VARCHAR\([^)]*\))[^\n]*\bREFERENCES\b', source, re.M))

check('Korean home features the downloadable lab', '/articles/ecommerce-erd-guide.html#practice' in documents['/'].links)
check('English home features the detailed lab', '/en/articles/ecommerce-erd-guide.html' in documents['/en/'].links)
check('English manual describes the available English guides',
      'Korean-only for now' not in file_for('/en/manual.html').read_text())

# Execute the exact published SQL rather than reimplementing its calculations.
lab = (DIST / 'downloads/order-history-lab.sql').read_text()
executable = '\n'.join(line for line in lab.splitlines() if not line.lstrip().startswith('--'))
connection = sqlite3.connect(':memory:')
connection.execute('PRAGMA foreign_keys = ON')
results = []
for statement in executable.split(';'):
    if not statement.strip():
        continue
    cursor = connection.execute(statement)
    if cursor.description:
        results.append(cursor.fetchall())
check('historical price, fan-out and corrected aggregates match published results',
      results == [[(70000, 80000)], [(140000,)], [(1001, 70000, 70000)]])
invalid = [
    'INSERT INTO lab_order_items VALUES (1001, 1, 1, "duplicate", 1, 1)',
    'INSERT INTO lab_order_items VALUES (9999, 1, 1, "unknown order", 1, 1)',
    'INSERT INTO lab_order_items VALUES (1001, 3, 9999, "unknown product", 1, 1)',
    'INSERT INTO lab_order_items VALUES (1001, 3, 1, "zero quantity", 1, 0)',
    'INSERT INTO lab_order_items VALUES (1001, 3, 1, "negative price", -1, 1)',
    'INSERT INTO lab_payments VALUES (13, 1001, -1)',
]
for statement in invalid:
    try:
        connection.execute(statement)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError('invalid row accepted: ' + statement)
check('keys, foreign keys and amount/quantity checks reject six invalid writes', True)
connection.execute('INSERT INTO lab_orders VALUES (1002)')
connection.execute('INSERT INTO lab_order_items VALUES (1002, 1, 1, "Keyboard", 30000, 1)')
last_query = executable[executable.index('WITH item_totals AS'):]
check('correct aggregate retains an unpaid order with zero paid',
      connection.execute(last_query).fetchall() == [(1001, 70000, 70000), (1002, 30000, 0)])

print('ALL PASS:', passed, 'offline checks. Browser layout and MySQL engine remain separate checks.')
