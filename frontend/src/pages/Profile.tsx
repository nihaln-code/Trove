import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Fuse from 'fuse.js'
import { useAuthStore } from '../store/auth'
import api, { TMDB_IMAGE } from '../services/api'
import type { StreamingService, TMDBProvider } from '../types'

const REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'KR', name: 'South Korea' },
]

export default function Profile() {
  const { user, setUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [avatarError, setAvatarError] = useState(false)
  const [providerRegion, setProviderRegion] = useState(user?.default_region ?? 'US')
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [providerSearch, setProviderSearch] = useState('')

  const { data: myServices = [] } = useQuery<StreamingService[]>({
    queryKey: ['streaming-services'],
    queryFn: () => api.get('/streaming-services').then((r) => r.data),
  })

  const { data: allProviders = [], isLoading: providersLoading } = useQuery<TMDBProvider[]>({
    queryKey: ['providers', providerRegion],
    queryFn: () =>
      api.get('/content/providers', { params: { region: providerRegion } }).then((r) => r.data),
    enabled: showAddPanel,
  })

  const updateRegion = useMutation({
    mutationFn: (region: string) => api.patch('/users/me', { default_region: region }),
    onSuccess: (res) => setUser(res.data),
  })

  const addService = useMutation({
    mutationFn: (provider: TMDBProvider) =>
      api.post('/streaming-services', {
        tmdb_provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        provider_logo_path: provider.logo_path,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['streaming-services'] }),
  })

  const removeService = useMutation({
    mutationFn: (id: number) => api.delete(`/streaming-services/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['streaming-services'] }),
  })

  const updateServiceRegion = useMutation({
    mutationFn: ({ id, region }: { id: number; region: string | null }) =>
      api.patch(`/streaming-services/${id}`, { region_override: region }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['streaming-services'] }),
  })

  const myProviderIds = new Set(myServices.map((s) => s.tmdb_provider_id))

  const providerFuse = useMemo(
    () => new Fuse(allProviders, { keys: ['provider_name'], threshold: 0.35, ignoreLocation: true }),
    [allProviders],
  )
  const filteredProviders = providerSearch
    ? providerFuse.search(providerSearch).map((r) => r.item)
    : allProviders

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 font-display text-3xl text-trove-text">Profile & Settings</h1>

      {/* Account */}
      <section className="mb-8 rounded-xl border border-trove-border bg-trove-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-trove-text">Account</h2>
        <div className="flex items-center gap-4">
          {user?.avatar_url && !avatarError ? (
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full">
              <img
                src={user.avatar_url}
                alt={user.name}
                className="h-full w-full object-cover"
                onError={() => setAvatarError(true)}
              />
            </div>
          ) : (
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-trove-accent text-xl font-bold text-white">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-trove-text">{user?.name}</p>
            <p className="text-sm text-trove-muted">{user?.email}</p>
          </div>
        </div>
      </section>

      {/* Default Region */}
      <section className="mb-8 rounded-xl border border-trove-border bg-trove-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-trove-text">Default Region</h2>
        <p className="mb-4 text-sm text-trove-muted">
          Default region that will be applied to streaming services unless a different region is selected
        </p>
        <div className="flex items-center gap-3">
          <select
            value={user?.default_region ?? 'US'}
            onChange={(e) => updateRegion.mutate(e.target.value)}
            className="rounded-lg border border-trove-border bg-trove-surface px-3 py-2 text-sm text-trove-text outline-none focus:border-trove-accent"
          >
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
            ))}
          </select>
          {updateRegion.isPending && (
            <span className="text-xs text-trove-muted">Saving...</span>
          )}
          {updateRegion.isSuccess && (
            <span className="text-xs text-green-400">Saved</span>
          )}
        </div>
      </section>

      {/* Streaming Services */}
      <section className="rounded-xl border border-trove-border bg-trove-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-trove-text">Streaming Services</h2>
            <p className="text-sm text-trove-muted">{myServices.length} services added</p>
          </div>
          <button
            onClick={() => setShowAddPanel((v) => !v)}
            className="cursor-pointer rounded-lg bg-trove-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-trove-accent-hover"
          >
            {showAddPanel ? 'Done' : '+ Add Service'}
          </button>
        </div>

        {/* My services list */}
        {myServices.length > 0 && (
          <div className="mb-6 space-y-3">
            {myServices.map((svc) => (
              <div
                key={svc.id}
                className="flex items-center gap-3 rounded-lg border border-trove-border bg-trove-surface p-3"
              >
                {svc.provider_logo_path ? (
                  <img
                    src={TMDB_IMAGE(svc.provider_logo_path, 'original') ?? ''}
                    alt={svc.provider_name}
                    className="h-8 w-8 rounded object-contain"
                  />
                ) : (
                  <div className="h-8 w-8 rounded bg-trove-border" />
                )}
                <span className="flex-1 text-sm font-medium text-trove-text">{svc.provider_name}</span>

                <select
                  value={svc.region_override ?? ''}
                  onChange={(e) =>
                    updateServiceRegion.mutate({ id: svc.id, region: e.target.value || null })
                  }
                  className="rounded border border-trove-border bg-trove-card px-2 py-1 text-xs text-trove-muted outline-none focus:border-trove-accent"
                  title="Region override (leave blank to use default)"
                >
                  <option value="">Default ({user?.default_region ?? 'US'})</option>
                  {REGIONS.map((r) => (
                    <option key={r.code} value={r.code}>{r.code}</option>
                  ))}
                </select>

                <button
                  onClick={() => removeService.mutate(svc.id)}
                  className="cursor-pointer text-trove-muted transition-colors hover:text-red-400"
                  title="Remove"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add service panel */}
        {showAddPanel && (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-trove-muted"
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder="Search services..."
                  className="w-full rounded-lg border border-trove-border bg-trove-surface py-1.5 pl-9 pr-3 text-sm text-trove-text placeholder-trove-muted outline-none focus:border-trove-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-trove-muted">Region:</span>
                <select
                  value={providerRegion}
                  onChange={(e) => setProviderRegion(e.target.value)}
                  className="rounded border border-trove-border bg-trove-surface px-2 py-1 text-xs text-trove-text outline-none focus:border-trove-accent"
                >
                  {REGIONS.map((r) => (
                    <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
                  ))}
                </select>
              </div>
            </div>

            {providersLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto sm:grid-cols-3">
                {filteredProviders.map((provider) => {
                  const isAdded = myProviderIds.has(provider.provider_id)
                  return (
                    <button
                      key={provider.provider_id}
                      onClick={() => !isAdded && addService.mutate(provider)}
                      disabled={isAdded || addService.isPending}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors ${
                        isAdded
                          ? 'cursor-default border-trove-accent bg-trove-accent/10 text-trove-accent'
                          : 'border-trove-border bg-trove-surface text-trove-text hover:border-trove-accent'
                      }`}
                    >
                      {provider.logo_path ? (
                        <img
                          src={TMDB_IMAGE(provider.logo_path, 'original') ?? ''}
                          alt={provider.provider_name}
                          className="h-6 w-6 rounded object-contain flex-shrink-0"
                        />
                      ) : (
                        <div className="h-6 w-6 flex-shrink-0 rounded bg-trove-border" />
                      )}
                      <span className="truncate text-xs">{provider.provider_name}</span>
                      {isAdded && <span className="ml-auto text-xs">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
