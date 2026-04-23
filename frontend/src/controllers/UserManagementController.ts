import { adminClient } from "@/lib/adminClient";
import { UserAccount, UserAccountStatus, UserRole } from "@/models/UserAccount";
import type { BackendAdminUser } from "@/types";

export class UserManagementController {
  private _searchQuery: string = "";
  private _users: UserAccount[] = [];
  private _isLoading: boolean = false;
  private _errorMessage: string | null = null;
  private _infoMessage: string | null = null;
  private onUpdate: (() => void) | null = null;

  public setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  public get isLoading(): boolean {
    return this._isLoading;
  }

  public get errorMessage(): string | null {
    return this._errorMessage;
  }

  public get infoMessage(): string | null {
    return this._infoMessage;
  }

  public clearInfoMessage(): void {
    this._infoMessage = null;
    this.notifyUpdate();
  }

  public async load(): Promise<void> {
    this._isLoading = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      const users = await adminClient.listUsers();
      this._users = users.map(mapBackendUser);
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to load users.";
    } finally {
      this._isLoading = false;
      this.notifyUpdate();
    }
  }

  public setSearchQuery(query: string): void {
    this._searchQuery = query;
  }

  public getFilteredUsers(): UserAccount[] {
    if (this._searchQuery.trim().length === 0) {
      return [...this._users];
    }

    return this._users.filter((user) => user.matchesSearch(this._searchQuery));
  }

  public async approveUser(id: string): Promise<void> {
    await this.mutateUser(id, () => adminClient.approveUser(id), "User approved successfully");
  }

  public async rejectUser(id: string): Promise<void> {
    await this.mutateUser(id, () => adminClient.rejectUser(id), "User rejected successfully");
  }

  public getTotalCount(): number {
    return this._users.length;
  }

  public getFilteredCount(): number {
    return this.getFilteredUsers().length;
  }

  private async mutateUser(
    id: string,
    action: () => Promise<BackendAdminUser>,
    successMessage: string,
  ): Promise<void> {
    this._isLoading = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      const updatedUser = await action();
      this._users = this._users.map((user) => {
        return user.id === id ? mapBackendUser(updatedUser) : user;
      });
      this.setInfoMessage(successMessage);
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to update user.";
    } finally {
      this._isLoading = false;
      this.notifyUpdate();
    }
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate();
    }
  }

  private setInfoMessage(message: string): void {
    this._infoMessage = message;
    window.setTimeout(() => {
      this._infoMessage = null;
      this.notifyUpdate();
    }, 2500);
  }
}

const mapBackendUser = (user: BackendAdminUser): UserAccount => {
  return new UserAccount(
    user.id,
    user.name,
    user.email,
    user.role === "admin" ? UserRole.ADMIN : UserRole.USER,
    user.project_count,
    mapApprovalStatus(user.approval_status),
  );
};

const mapApprovalStatus = (status: BackendAdminUser["approval_status"]): UserAccountStatus => {
  switch (status) {
    case "approved":
      return UserAccountStatus.APPROVED;
    case "rejected":
      return UserAccountStatus.REJECTED;
    case "pending":
    default:
      return UserAccountStatus.PENDING;
  }
};
