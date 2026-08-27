import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const requireIntegrationAuth: RequestHandler = (req, res, next) => {
  const configuredToken = process.env.GESTION_PEDIDOS_INTEGRATION_TOKEN;

  if (!configuredToken || configuredToken.trim().length === 0) {
    res.status(503).json({
      error: "Servicio de integración no configurado",
      code: "INTEGRATION_NOT_CONFIGURED",
    });
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    res.status(401).json({
      error: "Token de integración no proporcionado",
      code: "UNAUTHORIZED",
    });
    return;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    res.status(401).json({
      error: "Formato de autorización no válido. Debe ser: Bearer <token>",
      code: "UNAUTHORIZED",
    });
    return;
  }

  const providedToken = match[1].trim();

  // Hash both tokens with sha256 before timingSafeEqual to avoid length leak and ensure fixed-length buffers
  const providedHash = createHash("sha256").update(providedToken).digest();
  const expectedHash = createHash("sha256").update(configuredToken).digest();

  if (!timingSafeEqual(providedHash, expectedHash)) {
    res.status(401).json({
      error: "Token de integración no válido",
      code: "UNAUTHORIZED",
    });
    return;
  }

  next();
};
