import { createBrowserRouter, Outlet } from 'react-router-dom';
import Home from './Home';
import { TermsPage } from './components/terms/TermsPage';
import { AnalyticsTracker } from './components/common/AnalyticsTracker';
import { StrategyDetailPage } from './pages/StrategyDetailPage';
import { VaultPage } from './pages/VaultPage';

const RootLayout = () => (
  <>
    <AnalyticsTracker />
    <Outlet />
  </>
);

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <Home />,
      },
      {
        path: '/terms',
        element: <TermsPage />,
      },
      {
        path: '/strategy/:id', // Strategy detail page route
        element: <StrategyDetailPage />,
      },
      {
        path: '/vault',
        element: <VaultPage />,
      },
    ],
  },
]);

export default router;
