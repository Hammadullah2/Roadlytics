export type AuthRole = "guest" | "admin";

export type AuthSnapshot = {
  isAuthenticated: boolean;
  userLabel: string;
  role: AuthRole | null;
};

type AuthSession = {
  role: AuthRole;
  userLabel: string;
};

export class AuthService {
  private static instance: AuthService | null = null;
  private static readonly storageKey = "road-quality-session";
  private readonly listeners = new Set<() => void>();
  private session: AuthSession | null;
  private snapshot: AuthSnapshot;

  private constructor() {
    this.session = this.readSession();
    this.snapshot = this.createSnapshot(this.session);
  }

  public static getInstance(): AuthService {
    if (AuthService.instance === null) {
      AuthService.instance = new AuthService();
    }

    return AuthService.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): AuthSnapshot {
    return this.snapshot;
  }

  public loginAsGuest(): void {
    this.persistSession({
      role: "guest",
      userLabel: "Guest Mode",
    });
  }

  public loginAsAdmin(): void {
    this.persistSession({
      role: "admin",
      userLabel: "Admin Session",
    });
  }

  public logout(): void {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AuthService.storageKey);
    }

    this.setSession(null);
  }

  private readSession(): AuthSession | null {
    if (typeof window === "undefined") {
      return null;
    }

    const rawSession = window.localStorage.getItem(AuthService.storageKey);
    if (rawSession === null) {
      return null;
    }

    try {
      const parsedSession = JSON.parse(rawSession) as Partial<AuthSession>;
      if (
        (parsedSession.role === "guest" || parsedSession.role === "admin") &&
        typeof parsedSession.userLabel === "string" &&
        parsedSession.userLabel.trim().length > 0
      ) {
        return {
          role: parsedSession.role,
          userLabel: parsedSession.userLabel.trim(),
        };
      }
    } catch {
      // Ignore invalid persisted sessions and clear them below.
    }

    window.localStorage.removeItem(AuthService.storageKey);
    return null;
  }

  private persistSession(session: AuthSession): void {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AuthService.storageKey, JSON.stringify(session));
    }

    this.setSession(session);
  }

  private setSession(session: AuthSession | null): void {
    if (
      this.session?.role === session?.role &&
      this.session?.userLabel === session?.userLabel
    ) {
      return;
    }

    this.session = session;
    this.snapshot = this.createSnapshot(session);
    this.emitChange();
  }

  private createSnapshot(session: AuthSession | null): AuthSnapshot {
    return {
      isAuthenticated: session !== null,
      userLabel: session?.userLabel ?? "Logged Out",
      role: session?.role ?? null,
    };
  }

  private emitChange(): void {
    this.listeners.forEach((listener) => listener());
  }
}
