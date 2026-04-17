import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";
import NavBar from "./components/NavBar";
import ClaimPage from "./pages/ClaimPage";
import CreateCapsule from "./pages/CreateCapsule";
import Dashboard from "./pages/Dashboard";
import LandingPage from "./pages/LandingPage";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background bg-grid">
      <NavBar />
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const createRoute_ = createRoute({
  getParentRoute: () => rootRoute,
  path: "/create",
  component: CreateCapsule,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: Dashboard,
});

const claimRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/claim/$id",
  component: ClaimPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  createRoute_,
  dashboardRoute,
  claimRoute,
]);
