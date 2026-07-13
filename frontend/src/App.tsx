import { Navigate, Route, Routes } from "react-router-dom";
import { ReactElement } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ApprovalScreen from "./pages/ApprovalScreen";
import CreateRequest from "./pages/CreateRequest";

function RequireAuth({ children }: { children: ReactElement }) {
  const isLoggedIn = Boolean(localStorage.getItem("accessToken"));
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/new"
        element={
          <RequireAuth>
            <CreateRequest />
          </RequireAuth>
        }
      />
      <Route
        path="/edit/:requestNumber"
        element={
          <RequireAuth>
            <CreateRequest />
          </RequireAuth>
        }
      />
      <Route
        path="/approve/:requestNumber"
        element={
          <RequireAuth>
            <ApprovalScreen />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
