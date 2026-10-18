import { onRequestGet as __api_detect_js_onRequestGet } from "C:\\Users\\lx.chenchan\\Downloads\\Guess-Grab\\functions\\api\\detect.js"
import { onRequestPost as __api_detect_js_onRequestPost } from "C:\\Users\\lx.chenchan\\Downloads\\Guess-Grab\\functions\\api\\detect.js"
import { onRequest as __api_detect_backup_js_onRequest } from "C:\\Users\\lx.chenchan\\Downloads\\Guess-Grab\\functions\\api\\detect.backup.js"

export const routes = [
    {
      routePath: "/api/detect",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_detect_js_onRequestGet],
    },
  {
      routePath: "/api/detect",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_detect_js_onRequestPost],
    },
  {
      routePath: "/api/detect.backup",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_detect_backup_js_onRequest],
    },
  ]