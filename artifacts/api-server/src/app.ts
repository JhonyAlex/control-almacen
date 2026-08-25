import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const configuredCorsOrigins = process.env.CORS_ORIGIN
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors(
    configuredCorsOrigins && configuredCorsOrigins.length > 0
      ? { origin: configuredCorsOrigins, credentials: true }
      : undefined,
  ),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

const publicDirectory = path.resolve(
  process.env.STATIC_DIR ??
    path.join(process.cwd(), "artifacts/control-bobinas/dist/public"),
);

app.use(
  express.static(publicDirectory, {
    index: "index.html",
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  }),
);

// Vite builds a client-side router. Return its entry point for browser routes
// while leaving /api errors to the API router and Express' error handling.
app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => {
  res.sendFile(path.join(publicDirectory, "index.html"), (error) => {
    if (error) next();
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta API no encontrada" });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Datos inválidos",
      details: error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  logger.error(
    { err: error, method: req.method, url: req.originalUrl },
    "Unhandled request error",
  );
  res.status(500).json({ error: "Error interno del servidor" });
};

app.use(errorHandler);

export default app;
