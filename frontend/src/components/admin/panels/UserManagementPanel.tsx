import { RotateCw } from "lucide-react";
import { useState } from "react";

import { UserManagementController } from "@/controllers/UserManagementController";
import { AdminSearchInput } from "@/components/admin/shared/AdminSearchInput";
import { UsersTable } from "@/components/admin/tables/UsersTable";

type UserManagementPanelProps = {
  controller: UserManagementController;
};

class UserManagementPanelCopy {
  public static readonly title = "User Management";
  public static readonly addLabel = "Refresh Users";
  public static readonly searchPlaceholder = "Search users...";
}

export const UserManagementPanel = ({
  controller,
}: UserManagementPanelProps): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const users = controller.getFilteredUsers();

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[1.25rem] font-bold text-[color:var(--text-primary)]">
          {UserManagementPanelCopy.title}
        </h1>

        <button
          type="button"
          onClick={() => {
            void controller.load();
          }}
          className="flex items-center gap-2 rounded-[8px] bg-[color:var(--accent-green)] px-5 py-2 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)]"
        >
          <RotateCw size={16} />
          <span>{UserManagementPanelCopy.addLabel}</span>
        </button>
      </div>

      {controller.infoMessage ? (
        <div className="mb-4 rounded-[10px] border border-[color:var(--accent-green)]/30 bg-[color:var(--accent-green)]/10 px-4 py-3 text-sm text-[color:var(--text-primary)]">
          {controller.infoMessage}
        </div>
      ) : null}

      {controller.errorMessage ? (
        <div className="mb-4 rounded-[10px] border border-[#f85149]/30 bg-[#f85149]/10 px-4 py-3 text-sm text-[#fda4af]">
          {controller.errorMessage}
        </div>
      ) : null}

      <div className="mb-5">
        <AdminSearchInput
          value={searchQuery}
          placeholder={UserManagementPanelCopy.searchPlaceholder}
          onChange={(value) => {
            setSearchQuery(value);
            controller.setSearchQuery(value);
          }}
        />
      </div>

      <UsersTable
        users={users}
        isLoading={controller.isLoading}
        searchQuery={searchQuery}
        onApprove={(id) => {
          void controller.approveUser(id);
        }}
        onReject={(id) => {
          void controller.rejectUser(id);
        }}
      />
    </section>
  );
};
