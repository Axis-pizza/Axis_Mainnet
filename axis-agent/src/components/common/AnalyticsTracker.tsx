import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import ReactGA from 'react-ga4';

export const AnalyticsTracker = () => {
  const location = useLocation();

  useEffect(() => {
    // URLが変わるたびにGA4へ通知
    ReactGA.send({
      hitType: 'pageview',
      page: location.pathname + location.searchStr,
    });
  }, [location]);

  return null;
};
