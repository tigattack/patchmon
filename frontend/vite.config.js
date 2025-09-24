import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		port: 3000,
		host: "0.0.0.0", // Listen on all interfaces
		strictPort: true, // Exit if port is already in use
		allowedHosts: true, // Allow all hosts in development
		proxy: {
			"/api": {
				target: `http://${process.env.BACKEND_HOST}:${process.env.BACKEND_PORT}`,
				changeOrigin: true,
				secure: false,
				configure:
					process.env.VITE_ENABLE_LOGGING === "true"
						? (proxy, options) => {
								proxy.on("error", (err, req, res) => {
									console.log("proxy error", err);
								});
								proxy.on("proxyReq", (proxyReq, req, res) => {
									console.log(
										"Sending Request to the Target:",
										req.method,
										req.url,
									);
								});
								proxy.on("proxyRes", (proxyRes, req, res) => {
									console.log(
										"Received Response from the Target:",
										proxyRes.statusCode,
										req.url,
									);
								});
							}
						: undefined,
			},
		},
	},
	build: {
		outDir: "dist",
		sourcemap: process.env.NODE_ENV !== "production",
		target: "es2018",
	},
});
