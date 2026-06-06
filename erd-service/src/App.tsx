import Toolbar from './components/toolbar/Toolbar';
import ERDCanvas from './components/canvas/ERDCanvas';
import EntityEditPanel from './components/panels/EntityEditPanel';
import { useERDStore } from './store/erdStore';

function App() {
  const { selectedEntityId } = useERDStore();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh',
      background: '#0f172a', overflow: 'hidden',
    }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <ERDCanvas />
        {selectedEntityId && <EntityEditPanel />}
      </div>
    </div>
  );
}

export default App;
