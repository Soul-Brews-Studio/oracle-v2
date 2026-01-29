import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { QuickLearn } from './components/QuickLearn';
import { Overview } from './pages/Overview';
import { Feed } from './pages/Feed';
import { DocDetail } from './pages/DocDetail';
import { Search } from './pages/Search';
import { Consult } from './pages/Consult';
import { Graph } from './pages/Graph';
import { Handoff } from './pages/Handoff';
import { Activity } from './pages/Activity';
import { Forum } from './pages/Forum';
import { Decisions } from './pages/Decisions';
import { Evolution } from './pages/Evolution';
import { Traces } from './pages/Traces';
import { Superseded } from './pages/Superseded';

function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/doc/:id" element={<DocDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/consult" element={<Consult />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/graph3d" element={<Navigate to="/graph" replace />} />
        <Route path="/handoff" element={<Handoff />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/decisions" element={<Decisions />} />
        <Route path="/evolution" element={<Evolution />} />
        <Route path="/traces" element={<Traces />} />
        <Route path="/traces/:id" element={<Traces />} />
        <Route path="/superseded" element={<Superseded />} />
      </Routes>
      <QuickLearn />
    </BrowserRouter>
  );
}

export default App;
