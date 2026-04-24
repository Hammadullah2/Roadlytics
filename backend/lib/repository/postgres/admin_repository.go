// Package postgres provides pgx-backed repository implementations.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository"
)

type adminRepository struct {
	pool *pgxpool.Pool
}

// NewAdminRepository creates a PostgreSQL-backed admin repository.
func NewAdminRepository(pool *pgxpool.Pool) repository.AdminRepository {
	return &adminRepository{pool: pool}
}

func (r *adminRepository) CountUsers(ctx context.Context) (int, error) {
	return r.count(ctx, "count users", `SELECT COUNT(*) FROM public.profiles`)
}

func (r *adminRepository) CountProjects(ctx context.Context) (int, error) {
	return r.count(ctx, "count projects", `SELECT COUNT(*) FROM public.projects`)
}

func (r *adminRepository) CountActiveJobs(ctx context.Context) (int, error) {
	return r.count(ctx, "count active jobs", `SELECT COUNT(*) FROM public.jobs WHERE status = 'running'`)
}

func (r *adminRepository) CountReports(ctx context.Context) (int, error) {
	return r.count(ctx, "count reports", `SELECT COUNT(*) FROM public.reports`)
}

func (r *adminRepository) ListRecentActivity(ctx context.Context, limit int) ([]*models.AdminActivity, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT entry_id, actor_name, action_label, project_name, created_at
		FROM (
			SELECT
				'profile-' || p.id::text AS entry_id,
				COALESCE(NULLIF(p.full_name, ''), COALESCE(NULLIF(p.email, ''), u.email, 'Unknown user')) AS actor_name,
				'Registered account' AS action_label,
				'' AS project_name,
				p.created_at
			FROM public.profiles p
			LEFT JOIN auth.users u ON u.id = p.id

			UNION ALL

			SELECT
				'project-' || pr.id::text AS entry_id,
				COALESCE(NULLIF(owner.full_name, ''), COALESCE(NULLIF(owner.email, ''), auth_owner.email, 'Unknown owner')) AS actor_name,
				'Created project' AS action_label,
				pr.name AS project_name,
				pr.created_at
			FROM public.projects pr
			LEFT JOIN public.profiles owner ON owner.id = pr.owner_id
			LEFT JOIN auth.users auth_owner ON auth_owner.id = pr.owner_id

			UNION ALL

			SELECT
				'log-' || l.id::text AS entry_id,
				COALESCE(NULLIF(actor.full_name, ''), COALESCE(NULLIF(actor.email, ''), auth_actor.email, 'System')) AS actor_name,
				COALESCE(NULLIF(l.message, ''), l.event_type) AS action_label,
				COALESCE(l.metadata->>'project_name', '') AS project_name,
				l.created_at
			FROM public.logs l
			LEFT JOIN public.profiles actor ON actor.id = l.user_id
			LEFT JOIN auth.users auth_actor ON auth_actor.id = l.user_id
		) activity_feed
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent activity: %w", err)
	}
	defer rows.Close()

	activities := make([]*models.AdminActivity, 0)
	for rows.Next() {
		var activity models.AdminActivity
		if err := rows.Scan(
			&activity.ID,
			&activity.User,
			&activity.Action,
			&activity.Project,
			&activity.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan recent activity: %w", err)
		}

		activities = append(activities, &activity)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recent activity: %w", err)
	}

	return activities, nil
}

func (r *adminRepository) ListUserSummaries(ctx context.Context, pendingOnly bool) ([]*models.AdminUserSummary, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			p.id,
			COALESCE(NULLIF(p.full_name, ''), COALESCE(NULLIF(p.email, ''), u.email, 'Unknown user')) AS full_name,
			COALESCE(NULLIF(p.email, ''), u.email, '') AS email,
			p.role,
			p.approval_status,
			COALESCE(COUNT(pr.id), 0) AS project_count,
			p.created_at
		FROM public.profiles p
		LEFT JOIN auth.users u ON u.id = p.id
		LEFT JOIN public.projects pr ON pr.owner_id = p.id
		WHERE ($1::boolean = false OR p.approval_status = 'pending')
		GROUP BY p.id, p.full_name, p.email, u.email, p.role, p.approval_status, p.created_at
		ORDER BY
			CASE WHEN p.approval_status = 'pending' THEN 0 ELSE 1 END,
			p.created_at DESC
	`, pendingOnly)
	if err != nil {
		return nil, fmt.Errorf("list user summaries: %w", err)
	}
	defer rows.Close()

	users := make([]*models.AdminUserSummary, 0)
	for rows.Next() {
		user, err := scanAdminUserSummary(rows)
		if err != nil {
			return nil, fmt.Errorf("scan user summary: %w", err)
		}

		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate user summaries: %w", err)
	}

	return users, nil
}

func (r *adminRepository) GetUserSummary(ctx context.Context, id string) (*models.AdminUserSummary, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT
			p.id,
			COALESCE(NULLIF(p.full_name, ''), COALESCE(NULLIF(p.email, ''), u.email, 'Unknown user')) AS full_name,
			COALESCE(NULLIF(p.email, ''), u.email, '') AS email,
			p.role,
			p.approval_status,
			COALESCE(COUNT(pr.id), 0) AS project_count,
			p.created_at
		FROM public.profiles p
		LEFT JOIN auth.users u ON u.id = p.id
		LEFT JOIN public.projects pr ON pr.owner_id = p.id
		WHERE p.id = $1
		GROUP BY p.id, p.full_name, p.email, u.email, p.role, p.approval_status, p.created_at
	`, id)

	user, err := scanAdminUserSummary(row)
	if err != nil {
		return nil, fmt.Errorf("get user summary %q: %w", id, err)
	}

	return user, nil
}

func (r *adminRepository) ListProjectSummaries(ctx context.Context) ([]*models.AdminProjectSummary, error) {
	rows, err := r.pool.Query(ctx, projectSummaryBaseQuery+`
		GROUP BY p.id, p.owner_id, p.name, p.description, owner.full_name, owner.email, auth_owner.email, p.created_at
		ORDER BY p.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list project summaries: %w", err)
	}
	defer rows.Close()

	projects := make([]*models.AdminProjectSummary, 0)
	for rows.Next() {
		project, err := scanAdminProjectSummary(rows)
		if err != nil {
			return nil, fmt.Errorf("scan project summary: %w", err)
		}

		projects = append(projects, project)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate project summaries: %w", err)
	}

	return projects, nil
}

func (r *adminRepository) GetProjectSummary(ctx context.Context, id string) (*models.AdminProjectSummary, error) {
	row := r.pool.QueryRow(ctx, projectSummaryBaseQuery+`
		WHERE p.id = $1
		GROUP BY p.id, p.owner_id, p.name, p.description, owner.full_name, owner.email, auth_owner.email, p.created_at
	`, id)

	project, err := scanAdminProjectSummary(row)
	if err != nil {
		return nil, fmt.Errorf("get project summary %q: %w", id, err)
	}

	return project, nil
}

func (r *adminRepository) DeleteProject(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM public.projects
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete admin project %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("delete admin project %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func (r *adminRepository) ListJobSummaries(ctx context.Context, limit int) ([]*models.AdminJobSummary, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			j.id,
			p.id AS project_id,
			p.name AS project_name,
			r.id AS region_id,
			r.name AS region_name,
			p.owner_id,
			COALESCE(NULLIF(owner.full_name, ''), COALESCE(NULLIF(owner.email, ''), auth_owner.email, 'Unknown owner')) AS owner_name,
			j.job_type,
			j.status,
			j.progress,
			j.created_at,
			j.started_at,
			j.completed_at
		FROM public.jobs j
		JOIN public.regions r ON r.id = j.region_id
		JOIN public.projects p ON p.id = r.project_id
		LEFT JOIN public.profiles owner ON owner.id = p.owner_id
		LEFT JOIN auth.users auth_owner ON auth_owner.id = p.owner_id
		ORDER BY j.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list job summaries: %w", err)
	}
	defer rows.Close()

	jobs := make([]*models.AdminJobSummary, 0)
	for rows.Next() {
		var summary models.AdminJobSummary
		if err := rows.Scan(
			&summary.ID,
			&summary.ProjectID,
			&summary.ProjectName,
			&summary.RegionID,
			&summary.RegionName,
			&summary.OwnerID,
			&summary.OwnerName,
			&summary.JobType,
			&summary.Status,
			&summary.Progress,
			&summary.CreatedAt,
			&summary.StartedAt,
			&summary.CompletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan job summary: %w", err)
		}

		jobs = append(jobs, &summary)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate job summaries: %w", err)
	}

	return jobs, nil
}

func (r *adminRepository) GetDatabaseSizeBytes(ctx context.Context) (int64, error) {
	var size int64
	if err := r.pool.QueryRow(ctx, `SELECT pg_database_size(current_database())`).Scan(&size); err != nil {
		return 0, fmt.Errorf("get database size: %w", err)
	}

	return size, nil
}

func (r *adminRepository) ListLogs(ctx context.Context, limit int) ([]*models.AdminLogEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			id::text,
			COALESCE(
				NULLIF(metadata->>'level', ''),
				CASE
					WHEN LOWER(event_type) LIKE '%error%' THEN 'ERROR'
					WHEN LOWER(event_type) LIKE '%warning%' THEN 'WARNING'
					ELSE 'INFO'
				END
			) AS level_label,
			COALESCE(NULLIF(message, ''), event_type) AS log_message,
			created_at
		FROM public.logs
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list logs: %w", err)
	}
	defer rows.Close()

	logs := make([]*models.AdminLogEntry, 0)
	for rows.Next() {
		var entry models.AdminLogEntry
		if err := rows.Scan(&entry.ID, &entry.Level, &entry.Message, &entry.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan log entry: %w", err)
		}

		logs = append(logs, &entry)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate logs: %w", err)
	}

	return logs, nil
}

func (r *adminRepository) AppendLog(ctx context.Context, userID *string, level, eventType, message string, metadata map[string]any) error {
	var metadataJSON any
	if metadata != nil {
		metadataBytes, err := json.Marshal(metadata)
		if err != nil {
			return fmt.Errorf("marshal log metadata: %w", err)
		}

		metadataJSON = string(metadataBytes)
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO public.logs (user_id, event_type, message, metadata)
		VALUES ($1::uuid, $2::text, $3::text, COALESCE($4::jsonb, '{}'::jsonb) || jsonb_build_object('level', $5::text))
	`, userID, eventType, message, metadataJSON, level)
	if err != nil {
		return fmt.Errorf("append log: %w", err)
	}

	return nil
}

func (r *adminRepository) GetSettings(ctx context.Context) (map[string]any, error) {
	if err := r.ensureSettingsTable(ctx); err != nil {
		return nil, err
	}

	var payload []byte
	if err := r.pool.QueryRow(ctx, `
		SELECT settings
		FROM public.system_settings
		WHERE id = 1
	`).Scan(&payload); err != nil {
		return nil, fmt.Errorf("get settings: %w", err)
	}

	settings := make(map[string]any)
	if len(payload) == 0 {
		return settings, nil
	}

	if err := json.Unmarshal(payload, &settings); err != nil {
		return nil, fmt.Errorf("decode settings payload: %w", err)
	}

	return settings, nil
}

func (r *adminRepository) SaveSettings(ctx context.Context, actorID string, settings map[string]any) (map[string]any, error) {
	if err := r.ensureSettingsTable(ctx); err != nil {
		return nil, err
	}

	payload, err := json.Marshal(settings)
	if err != nil {
		return nil, fmt.Errorf("marshal settings payload: %w", err)
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO public.system_settings (id, settings, updated_by, updated_at)
		VALUES (1, $1::jsonb, $2, NOW())
		ON CONFLICT (id) DO UPDATE
		SET settings = EXCLUDED.settings,
		    updated_by = EXCLUDED.updated_by,
		    updated_at = NOW()
	`, payload, actorID)
	if err != nil {
		return nil, fmt.Errorf("save settings: %w", err)
	}

	saved, err := r.GetSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("reload saved settings: %w", err)
	}

	return saved, nil
}

func (r *adminRepository) ensureSettingsTable(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.system_settings (
			id SMALLINT PRIMARY KEY CHECK (id = 1),
			settings JSONB NOT NULL DEFAULT '{}'::jsonb,
			updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("ensure system_settings table: %w", err)
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO public.system_settings (id, settings)
		VALUES (1, '{}'::jsonb)
		ON CONFLICT (id) DO NOTHING
	`)
	if err != nil {
		return fmt.Errorf("seed system_settings row: %w", err)
	}

	return nil
}

func (r *adminRepository) count(ctx context.Context, operation, query string) (int, error) {
	var count int
	if err := r.pool.QueryRow(ctx, query).Scan(&count); err != nil {
		return 0, fmt.Errorf("%s: %w", operation, err)
	}

	return count, nil
}

func scanAdminUserSummary(s scanner) (*models.AdminUserSummary, error) {
	var summary models.AdminUserSummary
	if err := s.Scan(
		&summary.ID,
		&summary.Name,
		&summary.Email,
		&summary.Role,
		&summary.ApprovalStatus,
		&summary.ProjectCount,
		&summary.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &summary, nil
}

func scanAdminProjectSummary(s scanner) (*models.AdminProjectSummary, error) {
	var summary models.AdminProjectSummary
	if err := s.Scan(
		&summary.ID,
		&summary.OwnerID,
		&summary.Name,
		&summary.Description,
		&summary.OwnerName,
		&summary.RegionCount,
		&summary.Status,
		&summary.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &summary, nil
}

const projectSummaryBaseQuery = `
	SELECT
		p.id,
		p.owner_id,
		p.name,
		COALESCE(p.description, '') AS description,
		COALESCE(NULLIF(owner.full_name, ''), COALESCE(NULLIF(owner.email, ''), auth_owner.email, 'Unknown owner')) AS owner_name,
		COUNT(DISTINCT r.id) AS region_count,
		CASE
			WHEN COUNT(DISTINCT j.id) = 0 THEN 'Pending'
			WHEN COUNT(DISTINCT CASE WHEN j.status = 'failed' THEN j.id END) > 0 THEN 'Failed'
			WHEN COUNT(DISTINCT CASE WHEN j.status = 'running' THEN j.id END) > 0 THEN 'In Progress'
			WHEN COUNT(DISTINCT j.id) = COUNT(DISTINCT CASE WHEN j.status = 'completed' THEN j.id END) THEN 'Completed'
			ELSE 'Pending'
		END AS project_status,
		p.created_at
	FROM public.projects p
	LEFT JOIN public.profiles owner ON owner.id = p.owner_id
	LEFT JOIN auth.users auth_owner ON auth_owner.id = p.owner_id
	LEFT JOIN public.regions r ON r.project_id = p.id
	LEFT JOIN public.jobs j ON j.region_id = r.id
`
