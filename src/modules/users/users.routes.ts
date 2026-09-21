import { Router, Request, Response, NextFunction } from 'express';
import { store } from '../../store/memoryStore';
import { authenticateJwt } from '../../middleware/auth';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
});

export class UsersController {
  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = store.getUserById(req.user!.id);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      const { passwordHash: _, ...safeUser } = user;
      res.status(200).json({ success: true, data: safeUser });
    } catch (err) {
      next(err);
    }
  }

  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = updateProfileSchema.parse(req.body);
      const user = store.getUserById(req.user!.id);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      if (validated.name) user.name = validated.name;
      if (validated.avatarUrl) user.avatarUrl = validated.avatarUrl;
      user.updatedAt = new Date().toISOString();

      const { passwordHash: _, ...safeUser } = user;
      res.status(200).json({ success: true, data: safeUser });
    } catch (err) {
      next(err);
    }
  }
}

const usersController = new UsersController();
const router = Router();

router.get('/profile', authenticateJwt, usersController.getProfile);
router.patch('/profile', authenticateJwt, usersController.updateProfile);

export default router;
