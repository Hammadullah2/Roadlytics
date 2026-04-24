export enum UserRole {
  ADMIN = "Admin",
  USER = "User",
}

export enum UserAccountStatus {
  APPROVED = "Approved",
  PENDING = "Pending",
  REJECTED = "Rejected",
}

class UserRoleColors {
  public static readonly admin = "#8957e5";
  public static readonly user = "#30363d";
}

class UserStatusColors {
  public static readonly approved = "#2ea043";
  public static readonly pending = "#d29922";
  public static readonly rejected = "#da3633";
}

export class UserAccount {
  public readonly id: string;
  public readonly name: string;
  public readonly email: string;
  private _role: UserRole;
  public readonly projectCount: number;
  private _status: UserAccountStatus;

  public constructor(
    id: string,
    name: string,
    email: string,
    role: UserRole,
    projectCount: number,
    status: UserAccountStatus,
  ) {
    this.id = id;
    this.name = name;
    this.email = email;
    this._role = role;
    this.projectCount = projectCount;
    this._status = status;
  }

  public get role(): UserRole {
    return this._role;
  }

  public get status(): UserAccountStatus {
    return this._status;
  }

  public get roleBadgeColor(): string {
    switch (this._role) {
      case UserRole.ADMIN:
        return UserRoleColors.admin;
      case UserRole.USER:
        return UserRoleColors.user;
      default:
        return UserRoleColors.user;
    }
  }

  public get roleTextColor(): string {
    return "white";
  }

  public get statusBadgeColor(): string {
    switch (this._status) {
      case UserAccountStatus.APPROVED:
        return UserStatusColors.approved;
      case UserAccountStatus.PENDING:
        return UserStatusColors.pending;
      case UserAccountStatus.REJECTED:
        return UserStatusColors.rejected;
      default:
        return UserStatusColors.pending;
    }
  }

  public get isActive(): boolean {
    return this._status === UserAccountStatus.APPROVED;
  }

  public updateRole(role: UserRole): void {
    this._role = role;
  }

  public deactivate(): void {
    this._status = UserAccountStatus.REJECTED;
  }

  public activate(): void {
    this._status = UserAccountStatus.APPROVED;
  }

  public matchesSearch(query: string): boolean {
    const normalizedQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(normalizedQuery) ||
      this.email.toLowerCase().includes(normalizedQuery) ||
      this._role.toLowerCase().includes(normalizedQuery)
    );
  }
}
