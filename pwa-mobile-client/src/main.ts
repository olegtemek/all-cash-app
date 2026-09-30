import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { appLocale } from './core/model/locale'
import './design/theme.css'

document.documentElement.lang = appLocale

createApp(App).use(router).mount('#app')
