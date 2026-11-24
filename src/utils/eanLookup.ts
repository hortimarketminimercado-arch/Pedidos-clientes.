import { buildSearchQueries } from './format';

export interface ProductImageCandidate {
  url: string;
  title: string;
  format: 'PNG' | 'JPG';
  source: string;
}

export interface EanLookupResult {
  ean: string;
  found: boolean;
  name?: string;
  weightLabel?: string;
  description?: string;
  department?: string;
  imageUrl?: string;
  sourceLabel?: string;
}

function inferDepartment(categoriesTags: string[] | undefined, name: string): string {
  const combined = `${(categoriesTags || []).join(' ')} ${name}`.toLowerCase();
  if (
    combined.includes('beverage') ||
    combined.includes('juice') ||
    combined.includes('water') ||
    combined.includes('soda') ||
    combined.includes('suco') ||
    combined.includes('água') ||
    combined.includes('agua') ||
    combined.includes('h2oh') ||
    combined.includes('refrigerante') ||
    combined.includes('cerveja')
  ) {
    return 'bebidas';
  }
  if (
    combined.includes('bread') ||
    combined.includes('cheese') ||
    combined.includes('dairy') ||
    combined.includes('milk') ||
    combined.includes('egg') ||
    combined.includes('pão') ||
    combined.includes('queijo') ||
    combined.includes('leite') ||
    combined.includes('iogurte')
  ) {
    return 'padaria-frios';
  }
  if (
    combined.includes('fruit') ||
    combined.includes('banana') ||
    combined.includes('manga') ||
    combined.includes('maçã') ||
    combined.includes('morango') ||
    combined.includes('laranja')
  ) {
    return 'frutas';
  }
  if (
    combined.includes('vegetable') ||
    combined.includes('tomato') ||
    combined.includes('lettuce') ||
    combined.includes('tomate') ||
    combined.includes('alface') ||
    combined.includes('verdura')
  ) {
    return 'hortifruti';
  }
  return 'mercearia';
}

interface OffSearchHit {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  quantity?: string;
  categories_tags?: string[];
  image_front_url?: string;
  image_url?: string;
  image_small_url?: string;
}

async function searchOpenFoodFacts(query: string, pageSize = 8): Promise<OffSearchHit[]> {
  try {
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=${pageSize}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.hits) ? data.hits : [];
  } catch {
    return [];
  }
}

export async function searchProductImages(query: string): Promise<ProductImageCandidate[]> {
  const queries = buildSearchQueries(query);
  if (queries.length === 0) return [];

  const results: ProductImageCandidate[] = [];
  const primary = queries[0];
  const secondary = queries[1] || queries[0];

  const offTasks = queries.slice(0, 2).map(async (q) => {
    const hits = await searchOpenFoodFacts(q, 8);
    for (const hit of hits) {
      const imgUrl = hit.image_front_url || hit.image_url || hit.image_small_url;
      if (!imgUrl) continue;
      const brands = Array.isArray(hit.brands) ? hit.brands.join(', ') : hit.brands || '';
      const titleParts = [hit.product_name, hit.quantity, brands].filter(Boolean);
      results.push({
        url: imgUrl,
        title: titleParts.join(' · ') || q,
        format: imgUrl.toLowerCase().endsWith('.png') ? 'PNG' : 'JPG',
        source: 'Open Food Facts',
      });
    }
  });

  const wikimediaTask = (async () => {
    for (const term of [`${secondary} png`, secondary]) {
      try {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
          term
        )}&gsrlimit=6&prop=imageinfo&iiprop=url|mime&format=json&origin=*`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        const pages = json.query?.pages ? (Object.values(json.query.pages) as Array<{ title?: string; imageinfo?: Array<{ url?: string; mime?: string }> }>) : [];
        for (const page of pages) {
          const info = page.imageinfo?.[0];
          if (!info?.url) continue;
          const mime = (info.mime || '').toLowerCase();
          if (mime.includes('png') || mime.includes('jpeg') || mime.includes('webp')) {
            results.push({
              url: info.url,
              title: (page.title || primary).replace(/^File:/i, ''),
              format: mime.includes('png') ? 'PNG' : 'JPG',
              source: mime.includes('png') ? 'Wikimedia PNG' : 'Wikimedia',
            });
          }
        }
      } catch {
        // Ignore network errors
      }
    }
  })();

  const wikipediaTask = (async () => {
    try {
      const url = `https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        secondary
      )}&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json&origin=*`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const pages = json.query?.pages ? (Object.values(json.query.pages) as Array<{ title?: string; thumbnail?: { source?: string } }>) : [];
      for (const page of pages) {
        if (page.thumbnail?.source) {
          results.push({
            url: page.thumbnail.source,
            title: page.title || secondary,
            format: page.thumbnail.source.toLowerCase().endsWith('.png') ? 'PNG' : 'JPG',
            source: 'Wikipedia PT',
          });
        }
      }
    } catch {
      // Ignore network errors
    }
  })();

  await Promise.all([...offTasks, wikimediaTask, wikipediaTask]);

  const seen = new Set<string>();
  return results
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .sort((a, b) => {
      const score = (c: ProductImageCandidate) =>
        (c.source === 'Open Food Facts' ? 2 : 0) + (c.format === 'PNG' ? 1 : 0);
      return score(b) - score(a);
    });
}

export async function lookupProductByEan(rawEan: string): Promise<EanLookupResult> {
  const ean = rawEan.replace(/\D/g, '');
  if (!ean) return { ean: '', found: false };

  const endpoints = [
    {
      label: 'Open Food Facts',
      url: `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
        ean
      )}.json?fields=product_name,product_name_pt,brands,quantity,generic_name,generic_name_pt,categories_tags,image_front_url,image_url`,
    },
    {
      label: 'Open Products Facts',
      url: `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(
        ean
      )}.json?fields=product_name,product_name_pt,brands,quantity,categories_tags,image_front_url,image_url`,
    },
    {
      label: 'Open Beauty Facts',
      url: `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(
        ean
      )}.json?fields=product_name,product_name_pt,brands,quantity,categories_tags,image_front_url,image_url`,
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const prod = data.product;
        const namePt = prod.product_name_pt || prod.product_name || '';
        const brand = prod.brands ? String(prod.brands).split(',')[0].trim() : '';
        const fullName =
          namePt && brand && !namePt.toLowerCase().includes(brand.toLowerCase())
            ? `${namePt} ${brand}`
            : namePt || brand;
        let imageUrl: string = prod.image_front_url || prod.image_url || '';
        if (!imageUrl && fullName) {
          const candidates = await searchProductImages(fullName);
          if (candidates[0]) imageUrl = candidates[0].url;
        }
        return {
          ean,
          found: true,
          name: fullName || `Produto EAN ${ean}`,
          weightLabel: prod.quantity || '1 unidade',
          description:
            prod.generic_name_pt ||
            prod.generic_name ||
            (brand ? `Marca: ${brand} · Código EAN: ${ean}` : `Código EAN: ${ean}`),
          department: inferDepartment(prod.categories_tags, fullName),
          imageUrl: imageUrl || undefined,
          sourceLabel: endpoint.label,
        };
      }
    } catch {
      // Try next database
    }
  }

  const hits = await searchOpenFoodFacts(ean, 3);
  const matched = hits.find((h) => h.code === ean) || hits[0];
  if (matched && (matched.product_name || matched.brands)) {
    const brand = Array.isArray(matched.brands) ? matched.brands[0] : matched.brands || '';
    const name = matched.product_name || brand || `Produto EAN ${ean}`;
    return {
      ean,
      found: true,
      name,
      weightLabel: matched.quantity || '1 unidade',
      description: brand ? `Marca: ${brand} · Código EAN: ${ean}` : `Código EAN: ${ean}`,
      department: inferDepartment(matched.categories_tags, name),
      imageUrl: matched.image_front_url || matched.image_url || matched.image_small_url,
      sourceLabel: 'Open Food Facts',
    };
  }

  return { ean, found: false };
}
