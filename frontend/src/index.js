import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

const nonceMeta = document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content');
const nonce = nonceMeta && nonceMeta !== '__CSP_NONCE__' ? nonceMeta : undefined;

const cache = createCache({ key: 'css', nonce });

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <CacheProvider value={cache}>
    <App />
  </CacheProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

