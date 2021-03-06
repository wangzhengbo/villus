import { makeCache } from './cache';
import { OperationResult, CachePolicy, Operation, ObservableLike, QueryVariables } from './types';
import { normalizeQuery, CombinedError } from './utils';
import { parseResponse } from './utils/network';

type Fetcher = typeof fetch;

type FetchOptions = Omit<RequestInit, 'body'>;

interface CachedOperation<TVars = QueryVariables> extends Operation<TVars> {
  cachePolicy?: CachePolicy;
}

interface GraphQLRequestContext {
  fetchOptions?: FetchOptions;
}

type ContextFactory = () => GraphQLRequestContext;

type SubscriptionForwarder<TData = any, TVars = QueryVariables> = (
  operation: Operation<TVars>
) => ObservableLike<OperationResult<TData>>;

export interface VqlClientOptions {
  url: string;
  fetch?: Fetcher;
  context?: ContextFactory;
  cachePolicy?: CachePolicy;
  subscriptionForwarder?: SubscriptionForwarder;
}

function resolveGlobalFetch(): Fetcher | undefined {
  if (typeof window !== 'undefined' && 'fetch' in window && window.fetch) {
    return window.fetch.bind(window);
  }

  if (typeof global !== 'undefined' && 'fetch' in global) {
    return (global as any).fetch;
  }

  return undefined;
}

function makeFetchOptions({ query, variables }: Operation, opts: FetchOptions) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    throw new Error('A query must be provided.');
  }

  return {
    method: 'POST',
    body: JSON.stringify({ query: normalizedQuery, variables }),
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...opts.headers
    }
  };
}

interface VqlClientOptionsWithFetcher extends VqlClientOptions {
  fetch: Fetcher;
}

export class VqlClient {
  private url: string;

  private fetch: Fetcher;

  private defaultCachePolicy: CachePolicy;

  private context?: ContextFactory;

  private cache = makeCache();

  private subscriptionForwarder?: SubscriptionForwarder;

  public constructor(opts: VqlClientOptionsWithFetcher) {
    this.url = opts.url;
    this.fetch = opts.fetch;
    this.context = opts.context;
    this.defaultCachePolicy = opts.cachePolicy || 'cache-first';
    this.subscriptionForwarder = opts.subscriptionForwarder;
  }

  /**
   * Executes an operation and returns a normalized response.
   */
  private async execute<TData>(opts: ReturnType<typeof makeFetchOptions>): Promise<OperationResult<TData>> {
    let response;
    try {
      response = await this.fetch(this.url, opts);
    } catch (err) {
      return {
        data: null,
        error: new CombinedError({ response, networkError: err })
      };
    }

    const parsed = await parseResponse<TData>(response);
    if (!parsed.ok || !parsed.body) {
      return {
        data: null,
        error: new CombinedError({ response: parsed, networkError: new Error(parsed.statusText) })
      };
    }

    return {
      data: parsed.body.data,
      error: parsed.body.errors ? new CombinedError({ response: parsed, graphqlErrors: parsed.body.errors }) : null
    };
  }

  public async executeQuery<TData = any, TVars = QueryVariables>(
    operation: CachedOperation<TVars>
  ): Promise<OperationResult> {
    const fetchOptions = this.context ? this.context().fetchOptions : {};
    const opts = makeFetchOptions(operation, fetchOptions || {});
    const policy = operation.cachePolicy || this.defaultCachePolicy;
    const cachedResult = this.cache.getCachedResult(operation);
    if (policy === 'cache-first' && cachedResult) {
      return cachedResult;
    }

    const cacheResult = (result: OperationResult<TData>) => {
      if (policy !== 'network-only') {
        this.cache.afterQuery(operation, result);
      }

      return result;
    };

    if (policy === 'cache-and-network' && cachedResult) {
      this.execute<TData>(opts).then(cacheResult);

      return cachedResult;
    }

    return this.execute<TData>(opts).then(cacheResult);
  }

  public async executeMutation<TData = any, TVars = QueryVariables>(
    operation: Operation<TVars>
  ): Promise<OperationResult> {
    const fetchOptions = this.context ? this.context().fetchOptions : {};
    const opts = makeFetchOptions(operation, fetchOptions || {});

    return this.execute<TData>(opts);
  }

  public executeSubscription<TData = any, TVars = QueryVariables>(operation: Operation<TVars>) {
    if (!this.subscriptionForwarder) {
      throw new Error('No subscription forwarder was set.');
    }

    return (this.subscriptionForwarder as SubscriptionForwarder<TData, TVars>)(operation);
  }
}

export function createClient(opts: VqlClientOptions) {
  opts.fetch = opts.fetch || resolveGlobalFetch();
  if (!opts.fetch) {
    throw new Error('Could not resolve a fetch() method, you should provide one.');
  }

  return new VqlClient(opts as VqlClientOptionsWithFetcher);
}
