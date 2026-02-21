type Status = "Active" | "Suspended" | "Revoked";

export default function StatusBadge({ status }: { status: Status }) {
    const cls =
        status === "Active" ? "badge-active" :
            status === "Suspended" ? "badge-suspended" : "badge-revoked";
    return (
        <span className={`badge ${cls}`}>
            <span className="badge-dot" />
            {status}
        </span>
    );
}
