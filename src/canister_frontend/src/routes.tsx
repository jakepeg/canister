import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";
import Footer from "./components/Footer";
import NavBar from "./components/NavBar";
import ClaimPage from "./pages/ClaimPage";
import CreateCapsule from "./pages/CreateCapsule";
import Dashboard from "./pages/Dashboard";
import FaqPage from "./pages/FaqPage";
import FindCanisterPage from "./pages/FindCanisterPage";
import LandingPage from "./pages/LandingPage";
import PrivacyPage from "./pages/PrivacyPage";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background bg-grid">
      <NavBar />
      <Outlet />
      <Footer />
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

const findRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/find",
  component: FindCanisterPage,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const faqRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/faq",
  component: FaqPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  createRoute_,
  dashboardRoute,
  claimRoute,
  findRoute,
  privacyRoute,
  faqRoute,
]);
