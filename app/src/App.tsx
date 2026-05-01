import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Borrow }    from "./pages/Borrow";
import { Lend }      from "./pages/Lend";
import { Portfolio } from "./pages/Portfolio";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"          element={<Navigate to="/borrow" replace />} />
        <Route path="/borrow"    element={<Borrow />} />
        <Route path="/lend"      element={<Lend />} />
        <Route path="/portfolio" element={<Portfolio />} />
      </Routes>
    </Layout>
  );
}
