import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const keys = {
  leads: ['leads'],
  lead: (id) => ['lead', id],
};

export function useLeads() {
  return useQuery({ queryKey: keys.leads, queryFn: api.listLeads });
}
export function useLead(id) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.lead(id),
    queryFn: () => api.getLead(id),
    enabled: Boolean(id),
    placeholderData: () => {
      const row = qc.getQueryData(keys.leads)?.find((l) => l.id === id);
      return row ? { ...row, discussions: null } : undefined;
    },
  });
}

// ---- optimistic update helpers -------------------------------------------------------------

function patchLead(qc, id, patch) {
  qc.setQueryData(keys.leads, (list) => list?.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  qc.setQueryData(keys.lead(id), (lead) => (lead ? { ...lead, ...patch } : lead));
}

async function snapshot(qc, id) {
  await qc.cancelQueries({ queryKey: keys.leads });
  await qc.cancelQueries({ queryKey: keys.lead(id) });
  return { list: qc.getQueryData(keys.leads), lead: qc.getQueryData(keys.lead(id)) };
}

function rollback(qc, id, ctx) {
  if (!ctx) return;
  qc.setQueryData(keys.leads, ctx.list);
  qc.setQueryData(keys.lead(id), ctx.lead);
}

function settle(qc, id) {
  qc.invalidateQueries({ queryKey: keys.leads });
  qc.invalidateQueries({ queryKey: keys.lead(id) });
}

// ---- mutations -----------------------------------------------------------------------------

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createLead,
    onSuccess: (lead) => {
      qc.setQueryData(keys.leads, (list) => [{ ...lead, discussions: undefined }, ...(list ?? [])]);
      qc.invalidateQueries({ queryKey: keys.leads });
    },
  });
}
export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => api.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      const ctx = await snapshot(qc, id);
      patchLead(qc, id, { status });
      return ctx;
    },
    onError: (_err, { id }, ctx) => rollback(qc, id, ctx),
    onSettled: (_d, _e, { id }) => settle(qc, id),
  });
}

export function useAddDiscussion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, followUpAt }) => api.addDiscussion(id, { note, followUpAt }),
    onMutate: async ({ id, note, followUpAt }) => {
      const ctx = await snapshot(qc, id);
      const now = new Date().toISOString();
      const temp = { id: `tmp-${now}`, note: note.trim(), followUpAt: followUpAt ?? null, createdAt: now };
      const summary = { lastNote: temp.note, lastDiscussionAt: now, ...(followUpAt && { followUpAt }) };

      qc.setQueryData(keys.leads, (list) =>
        list?.map((l) => (l.id === id ? { ...l, ...summary, discussionCount: l.discussionCount + 1 } : l)),
      );
      qc.setQueryData(keys.lead(id), (lead) =>
        lead
          ? { ...lead, ...summary, discussionCount: lead.discussionCount + 1, discussions: [temp, ...(lead.discussions ?? [])] }
          : lead,
      );
      return ctx;
    },
    onError: (_err, { id }, ctx) => rollback(qc, id, ctx),
    onSettled: (_d, _e, { id }) => settle(qc, id),
  });
}

export function useClearFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.clearFollowUp(id),
    onMutate: async ({ id }) => {
      const ctx = await snapshot(qc, id);
      patchLead(qc, id, { followUpAt: null });
      return ctx;
    },
    onError: (_err, { id }, ctx) => rollback(qc, id, ctx),
    onSettled: (_d, _e, { id }) => settle(qc, id),
  });
}

export function useInsights() {
  return useMutation({ mutationFn: ({ id }) => api.insights(id) });
}
