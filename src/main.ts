import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initAuth } from './lib/auth.svelte';

initAuth();
mount(App, { target: document.getElementById('app')! });
