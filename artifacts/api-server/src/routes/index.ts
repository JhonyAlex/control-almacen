import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import controlBobinasRouter from "./control-bobinas";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(controlBobinasRouter);

export default router;
