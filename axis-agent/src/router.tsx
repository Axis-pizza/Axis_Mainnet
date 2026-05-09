import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import Home from './Home';
import { TermsPage } from './components/terms/TermsPage';
import { AnalyticsTracker } from './components/common/AnalyticsTracker';
import { StrategyDetailPage } from './pages/StrategyDetailPage';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <AnalyticsTracker />
      <Outlet />
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: TermsPage,
});

const strategyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/strategy/$id',
  component: StrategyDetailPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  termsRoute,
  strategyDetailRoute,
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default router;
