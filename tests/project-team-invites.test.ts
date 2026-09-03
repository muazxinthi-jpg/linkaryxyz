import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/index';
import type { Env } from '../src/env';

const ctx = { waitUntil() {} };

function appEnv() {
  const requestedPaths: string[] = [];
  const env: Env = {
    ASSETS: {
      async fetch(input) {
        const request = typeof input === 'string' ? new Request(input) : input;
        const pathname = new URL(request.url).pathname;
        requestedPaths.push(pathname);
        if (pathname === '/assets/linkary-app/index.html') {
          return new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('not found', { status: 404 });
      },
    },
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
    APP_ENV: 'production',
  };
  return { env, requestedPaths };
}

test('Project Team invitation routes are real app deep links', async () => {
  for (const pathname of ['/team-invite?invite=test-code', '/settings/team-invites']) {
    const { env, requestedPaths } = appEnv();
    const response = await worker.fetch(new Request(`https://app.linkary.xyz${pathname}`), env, ctx);
    assert.equal(response.status, 200);
    assert.deepEqual(requestedPaths, ['/assets/linkary-app/index.html']);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  }

  const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
  assert.equal(app.includes("location.pathname === '/team-invite'"), true);
  assert.equal(app.includes("location.pathname === '/settings/team-invites'"), true);
  assert.equal(app.includes('TeamInviteAcceptExperience'), true);
  assert.equal(app.includes('ProjectTeamInvitesExperience'), true);
});

test('Project navigation exposes Team on wider layouts without changing Creator navigation', () => {
  const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
  const creatorNav = workspace.slice(workspace.indexOf('const creatorNav'), workspace.indexOf('const projectNav'));
  const projectNav = workspace.slice(workspace.indexOf('const projectNav'), workspace.indexOf('const nav ='));
  assert.equal(projectNav.includes("['/settings/team-invites', 'Team']"), true);
  assert.equal(creatorNav.includes("['/settings/team-invites', 'Team']"), false);

  const mobile = readFileSync(new URL('../frontend/src/workspace-mobile.css', import.meta.url), 'utf8');
  assert.match(mobile, /\.workspace-project\s+\.ops-nav\s+a\[href="\/settings\/team-invites"\]\s*\{[^}]*display:none!important/s);
  assert.equal(mobile.includes('grid-template-columns:repeat(6,minmax(0,1fr))!important'), true);
});

test('Team invitations have their own role schema and automatic membership trigger', () => {
  const migration = readFileSync(new URL('../migrations/0019_project_team_invitations.sql', import.meta.url), 'utf8');
  assert.equal(migration.includes('ALTER TABLE invites ADD COLUMN intended_project_role'), true);
  assert.equal(migration.includes("'admin','marketing_manager','analyst','viewer'"), true);
  assert.equal(migration.includes('trg_team_invite_redemption_guard_before_insert'), true);
  assert.equal(migration.includes('trg_team_invite_membership_after_redemption'), true);
  assert.equal(migration.includes("i.invite_type = 'team_invite'"), true);
  assert.equal(migration.includes('INSERT INTO organization_memberships'), true);
  assert.equal(migration.includes("WHEN organization_memberships.status = 'active' THEN organization_memberships.role"), true);
  assert.equal(migration.includes("'project_team_invite.accepted'"), true);
});

test('creating a Team invitation never consumes network invite credits', () => {
  const route = readFileSync(new URL('../src/routes/invites.ts', import.meta.url), 'utf8');
  const teamCreate = route.slice(route.indexOf("body.action === 'create_team'"), route.indexOf("body.action === 'revoke_team'"));
  assert.equal(teamCreate.includes("invite_type = 'team_invite'"), true);
  assert.equal(teamCreate.includes("'team_invite'"), true);
  assert.equal(teamCreate.includes('invite_balances'), false);
  assert.equal(teamCreate.includes('invite_ledger'), false);
  assert.equal(teamCreate.includes('consumesNetworkCredit: false'), true);
  assert.equal(teamCreate.includes("actor.role === 'admin' && role === 'admin'"), true);
  assert.equal(teamCreate.includes('Only a Project Owner can invite another Project Admin'), true);
});

test('Team invitation acceptance is single-use and separate from account type onboarding', () => {
  const route = readFileSync(new URL('../src/routes/invites.ts', import.meta.url), 'utf8');
  const acceptance = route.slice(route.indexOf("body.action === 'accept_team'"), route.indexOf("body.action === 'revoke'"));
  assert.equal(acceptance.includes('INSERT INTO invite_redemptions'), true);
  assert.equal(acceptance.includes('chosen_account_type, organization_id'), true);
  assert.equal(acceptance.includes("VALUES (?, ?, ?, NULL, ?, 'accepted_team'"), true);
  assert.equal(acceptance.includes("status = CASE WHEN uses + 1 >= max_uses THEN 'exhausted'"), true);
  assert.equal(acceptance.includes('team_invite_email_mismatch'), true);

  const routeCreate = route.slice(route.indexOf("body.action === 'create_team'"), route.indexOf("body.action === 'revoke_team'"));
  assert.equal(routeCreate.includes("allowed_account_types_json"), true);
  assert.equal(routeCreate.includes("'[]'"), true);
});

test('Team invitation UI explains the credit and role boundary', () => {
  const ui = readFileSync(new URL('../frontend/src/ProjectTeamInvitesExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes('0 network credits'), true);
  assert.equal(ui.includes('never consume your Project\'s network invite credits'), true);
  assert.equal(ui.includes("action: 'create_team'"), true);
  assert.equal(ui.includes("action: 'revoke_team'"), true);
  assert.equal(ui.includes("action: 'accept_team'"), true);
  assert.equal(ui.includes('Campaign Manager'), true);
  assert.equal(ui.includes('Project Admin'), true);
  assert.equal(ui.includes('Manage active team'), true);
});
