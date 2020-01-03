import { ref, Ref, inject } from '@vue/composition-api';
import { Operation } from './types';
import { VqlClient } from './client';

interface MutationCompositeOptions {
  query: Operation['query'];
}

export function useMutation({ query }: MutationCompositeOptions) {
  const client = inject('$villus') as VqlClient;
  const data: Ref<Record<string, any> | null> = ref(null);
  const fetching = ref(false);
  const done = ref(false);
  const errors: Ref<any[] | null> = ref(null);

  async function execute(opts: { variables?: Operation['variables'] } = {}) {
    if (!client) {
      throw new Error('Could not detect GraphQL Client');
    }

    try {
      fetching.value = true;
      const vars = opts.variables || {};
      const res = await client.executeMutation({
        query,
        variables: vars
      });

      data.value = res.data;
      errors.value = res.errors;
    } catch (err) {
      errors.value = [err];
      data.value = null;
    } finally {
      done.value = true;
      fetching.value = false;
    }
  }

  return { data, fetching, done, errors, execute };
}
