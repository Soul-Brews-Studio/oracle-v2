import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
        <Route path="/handoff" element={<Handoff />} />
        <Route path="/activity" element={<Activity />} />
      </Routes>
      <QuickLearn />
    </BrowserRouter>
  );
}

export default App;
