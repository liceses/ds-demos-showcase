import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/base.css'
import './styles/tag-picker.css'
import './styles/home.css'
import './styles/demos.css'
import './styles/admin.css'
import './styles/tag-strip.css'
import './styles/sponsor.css'
import './styles/rating.css'
import './styles/markdown.css'
import './styles/forum.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
