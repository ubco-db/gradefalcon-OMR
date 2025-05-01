const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function(app) {
  // API proxy
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://backend", 
      pathRewrite: { "^/api": "" },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.sendStatus(500);
      }
    })
  );
  
  // WebSocket proxy for Socket.io
  app.use(
    "/socket.io",
    createProxyMiddleware({
      target: "http://backend",
      ws: true,
      changeOrigin: true,
      secure: false,
      xfwd: true,
      onError: (err, req, res) => {
        console.error('WebSocket proxy error:', err);
        if (res && typeof res.sendStatus === 'function') {
          res.sendStatus(500);
        }
      }
    })
  );
};
