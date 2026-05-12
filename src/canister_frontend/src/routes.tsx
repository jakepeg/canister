import {
  Outlet,
  createRootRoute,
  createRoute,
  useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";
import Footer from "./components/Footer";
import NavBar from "./components/NavBar";
import { trackPageView } from "./lib/analytics";
import ClaimPage from "./pages/ClaimPage";
import CreateCapsule from "./pages/CreateCapsule";
import Dashboard from "./pages/Dashboard";
import AdminVouchersPage from "./pages/AdminVouchersPage";
import FaqPage from "./pages/FaqPage";
import FindCanisterPage from "./pages/FindCanisterPage";
import LandingPage from "./pages/LandingPage";
import PaymentCancelled from "./pages/PaymentCancelled";
import PaymentSuccess from "./pages/PaymentSuccess";
import PrivacyPage from "./pages/PrivacyPage";

function RootLayout() {
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    trackPageView(path);
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="min-h-screen bg-background bg-grid">
      <NavBar />
      <Outlet />
      <Footer />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
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

const adminVouchersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/vouchers",
  component: AdminVouchersPage,
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

const paymentSuccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payment/success",
  component: PaymentSuccess,
});

const paymentCancelledRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payment/cancelled",
  component: PaymentCancelled,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  createRoute_,
  dashboardRoute,
  adminVouchersRoute,
  claimRoute,
  findRoute,
  privacyRoute,
  faqRoute,
  paymentSuccessRoute,
  paymentCancelledRoute,
]);
