import express from 'express';
import { syncCurrentUser } from '../controllers/user-sync.controller';

const router = express.Router();

router.post('/sync', syncCurrentUser as any);

// Export both default and named export for compatibility
export default router;
module.exports = router;
