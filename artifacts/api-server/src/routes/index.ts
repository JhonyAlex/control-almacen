import { Router, type IRouter } from "express";
import healthRouter from "./health";
import controlBobinasRouter from "./control-bobinas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(controlBobinasRouter);

export default router;
