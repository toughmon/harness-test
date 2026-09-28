-- YourERD worked example: historical order values and aggregate fan-out.
-- Run once in an empty practice database. No existing tables are changed.
-- MySQL 8.0.16+ (InnoDB default engine), or SQLite 3.8.3+.
-- SQLite: enable PRAGMA foreign_keys = ON before running this file.
-- Amounts are integer KRW; tax, discounts, refunds and concurrency are out of scope.
CREATE TABLE lab_products (
  product_id INTEGER PRIMARY KEY,
  product_name VARCHAR(80) NOT NULL,
  current_price INTEGER NOT NULL CHECK (current_price >= 0)
);
CREATE TABLE lab_orders (order_id INTEGER PRIMARY KEY);
CREATE TABLE lab_order_items (
  order_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name VARCHAR(80) NOT NULL,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, line_no),
  FOREIGN KEY (order_id) REFERENCES lab_orders(order_id),
  FOREIGN KEY (product_id) REFERENCES lab_products(product_id)
);
CREATE TABLE lab_payments (
  payment_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  FOREIGN KEY (order_id) REFERENCES lab_orders(order_id)
);
INSERT INTO lab_products VALUES (1, 'Keyboard', 30000), (2, 'Mouse', 10000);
INSERT INTO lab_orders VALUES (1001);
INSERT INTO lab_order_items VALUES
  (1001, 1, 1, 'Keyboard', 30000, 2),
  (1001, 2, 2, 'Mouse', 10000, 1);
INSERT INTO lab_payments VALUES (11, 1001, 40000), (12, 1001, 30000);
UPDATE lab_products SET current_price = 35000 WHERE product_id = 1;

-- Expected: historical_total = 70000; current_catalog_total = 80000.
SELECT SUM(i.unit_price * i.quantity) AS historical_total,
       SUM(p.current_price * i.quantity) AS current_catalog_total
FROM lab_order_items i
JOIN lab_products p ON p.product_id = i.product_id;

-- Deliberately incorrect: two payment rows duplicate every order item.
-- Expected: inflated_total = 140000.
SELECT SUM(i.unit_price * i.quantity) AS inflated_total
FROM lab_order_items i
JOIN lab_payments p ON p.order_id = i.order_id;

-- Correct: aggregate each child table to one row per order before joining.
-- Expected: order_id = 1001; order_total = 70000; paid_total = 70000.
WITH item_totals AS (
  SELECT order_id, SUM(unit_price * quantity) AS order_total
  FROM lab_order_items GROUP BY order_id
), payment_totals AS (
  SELECT order_id, SUM(amount) AS paid_total
  FROM lab_payments GROUP BY order_id
)
SELECT o.order_id, i.order_total, COALESCE(p.paid_total, 0) AS paid_total
FROM lab_orders o
JOIN item_totals i ON i.order_id = o.order_id
LEFT JOIN payment_totals p ON p.order_id = o.order_id;
