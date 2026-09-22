import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { store } from '../../store/memoryStore';
import { config } from '../../config';
import { User, Session, AuthTokens } from '../../types';

const googleClient = new OAuth2Client(config.google.clientId);

export class AuthService {
  private generateTokens(user: User): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn as any }
    );

    return { accessToken, refreshToken };
  }

  public async register(email: string, password: string, name?: string): Promise<AuthTokens> {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await store.getUserByEmail(normalizedEmail);
    if (existing) {
      const error: any = new Error('User with this email already exists');
      error.statusCode = 409;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const now = new Date().toISOString();

    const newUser: User = {
      id: uuidv4(),
      email: normalizedEmail,
      passwordHash,
      name: name || normalizedEmail.split('@')[0],
      createdAt: now,
      updatedAt: now,
    };

    store.createUser(newUser);
    const tokens = this.generateTokens(newUser);

    const session: Session = {
      id: uuidv4(),
      userId: newUser.id,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      createdAt: now,
    };
    store.saveSession(session);

    const { passwordHash: _, ...safeUser } = newUser;
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: safeUser,
    };
  }

  public async login(email: string, password: string): Promise<AuthTokens> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await store.getUserByEmail(normalizedEmail);
    if (!user || !user.passwordHash) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const tokens = this.generateTokens(user);
    const session: Session = {
      id: uuidv4(),
      userId: user.id,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    store.saveSession(session);

    const { passwordHash: _, ...safeUser } = user;
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: safeUser,
    };
  }

  public async googleLogin(idToken: string): Promise<AuthTokens> {
    let email: string;
    let name: string | undefined;
    let googleId: string;
    let avatarUrl: string | undefined;

    try {
      if (config.google.clientId && config.google.clientId.length > 5) {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: config.google.clientId,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          throw new Error('Google payload invalid');
        }
        email = payload.email.toLowerCase().trim();
        name = payload.name;
        googleId = payload.sub;
        avatarUrl = payload.picture;
      } else {
        const decoded: any = jwt.decode(idToken);
        if (!decoded || !decoded.email) {
          throw new Error('Could not decode token');
        }
        email = decoded.email.toLowerCase().trim();
        name = decoded.name;
        googleId = decoded.sub || uuidv4();
        avatarUrl = decoded.picture;
      }
    } catch {
      const error: any = new Error('Failed to verify Google credentials');
      error.statusCode = 401;
      throw error;
    }

    let user = (await store.getUserByGoogleId(googleId)) || (await store.getUserByEmail(email));

    if (!user) {
      const now = new Date().toISOString();
      user = {
        id: uuidv4(),
        email,
        name: name || email.split('@')[0],
        googleId,
        avatarUrl,
        createdAt: now,
        updatedAt: now,
      };
      store.createUser(user);
    } else if (!user.googleId) {
      user.googleId = googleId;
      if (avatarUrl) user.avatarUrl = avatarUrl;
    }

    const tokens = this.generateTokens(user);
    const session: Session = {
      id: uuidv4(),
      userId: user.id,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    store.saveSession(session);

    const { passwordHash: _, ...safeUser } = user;
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: safeUser,
    };
  }

  public async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const session = await store.getSession(refreshToken);
    if (!session) {
      const error: any = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }

    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as { id: string };
      const user = await store.getUserById(payload.id);
      if (!user) {
        throw new Error('User not found');
      }

      store.deleteSession(refreshToken);

      const tokens = this.generateTokens(user);
      store.saveSession({
        id: uuidv4(),
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      });

      return tokens;
    } catch {
      const error: any = new Error('Invalid or expired refresh token');
      error.statusCode = 401;
      throw error;
    }
  }

  public logout(refreshToken: string): boolean {
    return store.deleteSession(refreshToken);
  }

  public async getMe(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await store.getUserById(userId);
    if (!user) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }
}

export const authService = new AuthService();
