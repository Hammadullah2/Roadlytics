import { UserAccount } from "@/models/UserAccount";
import { UserTableRow } from "@/components/admin/tables/UserTableRow";

type UsersTableProps = {
  users: UserAccount[];
  isLoading: boolean;
  searchQuery: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

class UsersTableCopy {
  public static readonly headers: string[] = [
    "Name",
    "Email",
    "Role",
    "Projects",
    "Status",
    "Actions",
  ];

  public static emptyMessage(query: string): string {
    return `No results found for '${query}'`;
  }
}

export const UsersTable = ({
  users,
  isLoading,
  searchQuery,
  onApprove,
  onReject,
}: UsersTableProps): JSX.Element => {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]">
            {UsersTableCopy.headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-left text-[0.8rem] font-semibold text-[color:var(--text-nav-label)]"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td
                colSpan={UsersTableCopy.headers.length}
                className="px-4 py-8 text-center text-[0.875rem] text-[color:var(--text-secondary)]"
              >
                Loading users...
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td
                colSpan={UsersTableCopy.headers.length}
                className="px-4 py-8 text-center text-[0.875rem] text-[color:var(--text-secondary)]"
              >
                {UsersTableCopy.emptyMessage(searchQuery)}
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <UserTableRow
                key={user.id}
                user={user}
                onApprove={() => onApprove(user.id)}
                onReject={() => onReject(user.id)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
