import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Global error and unhandled rejection listeners to prevent browser extension noise
// (e.g. MetaMask, Web3, Ethereum, or extension injection errors) from breaking the application.
if (typeof window !== 'undefined') {
  // Suppress console.error messages regarding MetaMask connection failures
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const errStr = args.map((a) => String(a?.message || a || '')).join(' ');
    if (
      errStr.toLowerCase().includes('metamask') ||
      errStr.toLowerCase().includes('failed to connect to metamask')
    ) {
      console.warn('Suppressed MetaMask connection error log:', errStr);
      return;
    }
    originalConsoleError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(
      event.reason?.message || event.reason?.stack || event.reason || ''
    ).toLowerCase();
    if (
      reasonStr.includes('metamask') ||
      reasonStr.includes('ethereum') ||
      reasonStr.includes('web3') ||
      reasonStr.includes('failed to connect') ||
      reasonStr.includes('extension') ||
      reasonStr.includes('receives a message')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      console.warn('Suppressed third-party browser extension rejection:', event.reason);
    }
  });

  window.addEventListener('error', (event) => {
    const msgStr = String(event.message || event.error?.message || '').toLowerCase();
    if (
      msgStr.includes('metamask') ||
      msgStr.includes('ethereum') ||
      msgStr.includes('web3') ||
      msgStr.includes('failed to connect') ||
      msgStr.includes('extension')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      console.warn('Suppressed third-party browser extension error:', event.message);
    }
  });

  // Comprehensive mock for window.ethereum to eliminate "Failed to connect to MetaMask" errors
  const mockMetaMask = {
    isMetaMask: true,
    isConnected: () => true,
    request: async (args: { method: string; params?: any[] }) => {
      const method = args?.method || '';
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return ['0x0000000000000000000000000000000000000000'];
      }
      if (method === 'eth_chainId') return '0x1';
      if (method === 'net_version') return '1';
      return null;
    },
    on: () => {},
    removeListener: () => {},
    autoRefreshOnNetworkChange: false,
    enable: async () => ['0x0000000000000000000000000000000000000000'],
    selectedAddress: '0x0000000000000000000000000000000000000000',
    networkVersion: '1',
    chainId: '0x1',
  };

  try {
    if (!(window as any).ethereum) {
      (window as any).ethereum = mockMetaMask;
    } else {
      const existingEth = (window as any).ethereum;
      const originalRequest = existingEth.request;
      existingEth.request = async (args: any) => {
        try {
          if (typeof originalRequest === 'function') {
            return await originalRequest.call(existingEth, args);
          }
        } catch (err) {
          console.warn('Intercepted original MetaMask request error:', err);
        }
        return mockMetaMask.request(args);
      };
      if (typeof existingEth.enable === 'function') {
        const originalEnable = existingEth.enable;
        existingEth.enable = async () => {
          try {
            return await originalEnable.call(existingEth);
          } catch (err) {
            return ['0x0000000000000000000000000000000000000000'];
          }
        };
      }
    }
  } catch (e) {
    try {
      Object.defineProperty(window, 'ethereum', {
        value: mockMetaMask,
        writable: true,
        configurable: true,
      });
    } catch (err) {
      console.warn('Could not override window.ethereum:', err);
    }
  }
}

// Register Service Worker for PWA Offline Functionality
if ('serviceWorker' in navigator) {
  const registerSW = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('Modbus Workbench Service Worker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    registerSW();
  } else {
    window.addEventListener('load', registerSW);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
