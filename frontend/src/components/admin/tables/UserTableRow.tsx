import { UserAccount, UserAccountStatus } from "@/models/UserAccount";
import { RoleBadge } from "@/components/admin/shared/RoleBadge";
import { StatusBadge } from "@/components/admin/shared/StatusBadge";

type UserTableRowProps = {
  user: UserAccount;
  onApprove: () => void;
  onReject: () => void;
};

export const UserTableRow = ({
  user,
  onApprove,
  onReject,
}: UserTableRowProps): JSX.Element => {
  const isPending = user.status === UserAccountStatus.PENDING;

  return (
    <tr className="border-b border-[color:var(--bg-card-hover)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] last:border-b-0">
      <td className="px-4 py-3 text-[0.875rem] font-medium text-[color:var(--text-primary)]">
        {user.name}
      </td>
      <td className="px-4 py-3 text-[0.875rem] text-[color:var(--text-secondary)]">
        {user.email}
      </td>
      <td className="px-4 py-3">
        <RoleBadge
          label={user.role}
          backgroundColor={user.roleBadgeColor}
          textColor={user.roleTextColor}
        />
      </td>
      <td className="px-4 py-3 text-center text-[0.875rem] text-[color:var(--text-secondary)]">
        {user.projectCount}
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          label={user.status}
          backgroundColor={user.statusBadgeColor}
          textColor="white"
        />
      </td>
      <td className="px-4 py-3">
        {isPending ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onApprove}
              className="rounded-[6px] bg-[color:var(--accent-green)] px-3 py-1.5 text-[0.75rem] font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)]"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={onReject}
              className="rounded-[6px] border border-transparent bg-[rgba(218,54,51,0.15)] px-3 py-1.5 text-[0.75rem] font-semibold text-[#f85149] transition-colors duration-150 hover:bg-[#da3633] hover:text-white"
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="text-[0.8rem] text-[color:var(--text-secondary)]">
            No actions
          </span>
        )}
      </td>
    </tr>
  );
};
