/**
 * Alimentos comuns para montar a dieta rápido. Valores APROXIMADOS por 100 g (ou 100 ml),
 * na linha da Tabela Brasileira de Composição de Alimentos (TACO/Unicamp) e da USDA.
 * Servem para estimar; o plano do nutricionista e o rótulo do produto valem mais.
 * Dá para editar os números de cada item na dieta ou cadastrar um alimento à mão.
 */

export interface FoodPortion {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  group: FoodGroup;
  /** Por 100 g (ou 100 ml para líquidos). */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Medida caseira comum. */
  portion?: FoodPortion;
  ml?: boolean;
}

export const FOOD_GROUPS = ['carbs', 'protein', 'dairy', 'fruit', 'veg', 'fat', 'drink', 'other'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];
export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  carbs: 'Pães, cereais e tubérculos',
  protein: 'Carnes, ovos e leguminosas',
  dairy: 'Leite e derivados',
  fruit: 'Frutas',
  veg: 'Verduras e legumes',
  fat: 'Óleos, castanhas e pastas',
  drink: 'Bebidas',
  other: 'Outros',
};

const f = (id: string, name: string, group: FoodGroup, kcal: number, proteinG: number, carbsG: number, fatG: number, portion?: FoodPortion, ml?: boolean): Food => ({
  id,
  name,
  group,
  kcal,
  proteinG,
  carbsG,
  fatG,
  ...(portion ? { portion } : {}),
  ...(ml ? { ml } : {}),
});

export const FOODS: Food[] = [
  // Pães, cereais e tubérculos
  f('arroz-branco', 'Arroz branco cozido', 'carbs', 128, 2.5, 28.1, 0.2, { label: '1 colher de servir', grams: 45 }),
  f('arroz-integral', 'Arroz integral cozido', 'carbs', 124, 2.6, 25.8, 1.0, { label: '1 colher de servir', grams: 45 }),
  f('macarrao', 'Macarrão cozido', 'carbs', 158, 5.8, 30.9, 0.9, { label: '1 pegador', grams: 110 }),
  f('batata-inglesa', 'Batata inglesa cozida', 'carbs', 52, 1.2, 11.9, 0.1, { label: '1 unidade média', grams: 140 }),
  f('batata-doce', 'Batata-doce cozida', 'carbs', 77, 0.6, 18.4, 0.1, { label: '1 unidade média', grams: 150 }),
  f('mandioca', 'Mandioca (aipim) cozida', 'carbs', 125, 0.6, 30.1, 0.3, { label: '1 pedaço', grams: 100 }),
  f('cuscuz', 'Cuscuz de milho cozido', 'carbs', 113, 2.2, 25.3, 0.7, { label: '1 fatia', grams: 120 }),
  f('tapioca', 'Tapioca (goma hidratada)', 'carbs', 240, 0.2, 59.6, 0.1, { label: '1 tapioca', grams: 50 }),
  f('pao-frances', 'Pão francês', 'carbs', 300, 8.0, 58.6, 3.1, { label: '1 unidade', grams: 50 }),
  f('pao-forma-integral', 'Pão de forma integral', 'carbs', 253, 9.4, 49.9, 3.7, { label: '1 fatia', grams: 25 }),
  f('pao-queijo', 'Pão de queijo', 'carbs', 363, 5.1, 34.2, 24.6, { label: '1 unidade média', grams: 40 }),
  f('aveia', 'Aveia em flocos', 'carbs', 394, 13.9, 66.6, 8.5, { label: '1 colher de sopa', grams: 15 }),
  f('granola', 'Granola', 'carbs', 421, 10.0, 66.0, 13.0, { label: '1 colher de sopa', grams: 12 }),
  f('farinha-mandioca', 'Farinha de mandioca / farofa', 'carbs', 361, 1.6, 87.9, 0.3, { label: '1 colher de sopa', grams: 16 }),
  f('milho', 'Milho verde', 'carbs', 98, 3.2, 17.1, 2.1, { label: '1 colher de sopa', grams: 20 }),
  f('quinoa', 'Quinoa cozida', 'carbs', 120, 4.4, 21.3, 1.9, { label: '1 colher de servir', grams: 45 }),
  f('cream-cracker', 'Biscoito cream cracker', 'carbs', 432, 10.1, 68.7, 14.4, { label: '1 unidade', grams: 6 }),
  f('batata-frita', 'Batata frita', 'carbs', 267, 5.0, 35.6, 13.1, { label: '1 porção pequena', grams: 80 }),

  // Carnes, ovos e leguminosas
  f('frango-grelhado', 'Peito de frango grelhado', 'protein', 159, 32.0, 0, 2.5, { label: '1 filé', grams: 120 }),
  f('frango-cozido', 'Frango desfiado (peito cozido)', 'protein', 163, 31.5, 0, 3.2, { label: '1 colher de sopa cheia', grams: 25 }),
  f('coxa-frango', 'Coxa de frango assada', 'protein', 215, 28.5, 0, 10.4, { label: '1 coxa', grams: 70 }),
  f('patinho', 'Patinho / carne moída magra grelhada', 'protein', 219, 35.9, 0, 7.3, { label: '1 bife', grams: 100 }),
  f('alcatra', 'Alcatra grelhada', 'protein', 241, 31.9, 0, 11.6, { label: '1 bife', grams: 100 }),
  f('contrafile', 'Contrafilé grelhado', 'protein', 278, 32.4, 0, 15.5, { label: '1 bife', grams: 100 }),
  f('picanha', 'Picanha grelhada', 'protein', 289, 26.4, 0, 19.5, { label: '1 fatia', grams: 80 }),
  f('lombo-porco', 'Lombo de porco assado', 'protein', 210, 35.7, 0, 6.4, { label: '1 fatia', grams: 80 }),
  f('tilapia', 'Tilápia grelhada', 'protein', 128, 26.2, 0, 2.7, { label: '1 filé', grams: 120 }),
  f('salmao', 'Salmão grelhado', 'protein', 229, 23.9, 0, 14.0, { label: '1 posta', grams: 120 }),
  f('atum', 'Atum em lata (ao natural)', 'protein', 116, 25.5, 0, 0.8, { label: '1 lata drenada', grams: 120 }),
  f('ovo', 'Ovo inteiro cozido', 'protein', 146, 13.3, 0.6, 9.5, { label: '1 ovo', grams: 50 }),
  f('ovo-frito', 'Ovo frito', 'protein', 240, 15.6, 1.2, 18.6, { label: '1 ovo', grams: 50 }),
  f('clara', 'Clara de ovo', 'protein', 52, 10.9, 0.7, 0.2, { label: '1 clara', grams: 33 }),
  f('peito-peru', 'Peito de peru (fatiado)', 'protein', 104, 19.0, 2.0, 2.0, { label: '1 fatia', grams: 15 }),
  f('presunto', 'Presunto', 'protein', 94, 14.3, 2.1, 2.7, { label: '1 fatia', grams: 15 }),
  f('salsicha', 'Salsicha', 'protein', 257, 12.0, 5.8, 20.6, { label: '1 unidade', grams: 50 }),
  f('feijao-carioca', 'Feijão carioca cozido', 'protein', 76, 4.8, 13.6, 0.5, { label: '1 concha', grams: 90 }),
  f('feijao-preto', 'Feijão preto cozido', 'protein', 77, 4.5, 14.0, 0.5, { label: '1 concha', grams: 90 }),
  f('lentilha', 'Lentilha cozida', 'protein', 93, 6.3, 16.3, 0.5, { label: '1 concha', grams: 90 }),
  f('grao-de-bico', 'Grão-de-bico cozido', 'protein', 164, 8.9, 27.4, 2.6, { label: '1 colher de servir', grams: 50 }),
  f('whey', 'Whey protein (pó)', 'protein', 400, 80.0, 8.0, 6.0, { label: '1 dosador', grams: 30 }),

  // Leite e derivados
  f('leite-integral', 'Leite integral', 'dairy', 61, 2.9, 4.3, 3.2, { label: '1 copo', grams: 200 }, true),
  f('leite-desnatado', 'Leite desnatado', 'dairy', 35, 3.4, 4.9, 0.2, { label: '1 copo', grams: 200 }, true),
  f('iogurte-natural', 'Iogurte natural integral', 'dairy', 51, 4.1, 1.9, 3.0, { label: '1 pote', grams: 170 }),
  f('iogurte-desnatado', 'Iogurte natural desnatado', 'dairy', 41, 3.8, 5.8, 0.3, { label: '1 pote', grams: 170 }),
  f('queijo-minas', 'Queijo minas frescal', 'dairy', 264, 17.4, 3.2, 20.2, { label: '1 fatia', grams: 30 }),
  f('mucarela', 'Queijo muçarela', 'dairy', 330, 22.6, 3.0, 25.2, { label: '1 fatia', grams: 20 }),
  f('cottage', 'Queijo cottage', 'dairy', 98, 11.1, 3.4, 4.3, { label: '1 colher de sopa', grams: 30 }),
  f('requeijao', 'Requeijão cremoso', 'dairy', 257, 9.6, 2.4, 23.4, { label: '1 colher de sopa', grams: 30 }),

  // Frutas
  f('banana-prata', 'Banana prata', 'fruit', 98, 1.3, 26.0, 0.1, { label: '1 unidade', grams: 55 }),
  f('banana-nanica', 'Banana nanica', 'fruit', 92, 1.4, 23.8, 0.1, { label: '1 unidade', grams: 90 }),
  f('maca', 'Maçã', 'fruit', 56, 0.3, 15.2, 0, { label: '1 unidade', grams: 130 }),
  f('mamao', 'Mamão papaia', 'fruit', 40, 0.5, 10.4, 0.1, { label: '1/2 unidade', grams: 140 }),
  f('laranja', 'Laranja', 'fruit', 37, 1.0, 8.9, 0.1, { label: '1 unidade', grams: 140 }),
  f('manga', 'Manga', 'fruit', 64, 0.4, 16.7, 0.3, { label: '1 fatia grande', grams: 110 }),
  f('abacate', 'Abacate', 'fruit', 96, 1.2, 6.0, 8.4, { label: '1 colher de sopa', grams: 45 }),
  f('morango', 'Morango', 'fruit', 30, 0.9, 6.8, 0.3, { label: '10 unidades', grams: 120 }),
  f('uva', 'Uva', 'fruit', 53, 0.7, 13.6, 0.2, { label: '1 cacho pequeno', grams: 100 }),
  f('melancia', 'Melancia', 'fruit', 33, 0.9, 8.1, 0, { label: '1 fatia', grams: 200 }),
  f('abacaxi', 'Abacaxi', 'fruit', 48, 0.9, 12.3, 0.1, { label: '1 fatia', grams: 75 }),
  f('acai', 'Açaí (polpa sem açúcar)', 'fruit', 58, 0.8, 6.2, 3.9, { label: '1 pacote de polpa', grams: 100 }),

  // Verduras e legumes
  f('alface', 'Alface', 'veg', 11, 1.3, 1.7, 0.2, { label: '1 prato de sobremesa', grams: 40 }),
  f('tomate', 'Tomate', 'veg', 15, 1.1, 3.1, 0.2, { label: '1 unidade', grams: 100 }),
  f('cenoura', 'Cenoura crua', 'veg', 34, 1.3, 7.7, 0.2, { label: '1 colher de sopa ralada', grams: 15 }),
  f('brocolis', 'Brócolis cozido', 'veg', 25, 2.1, 4.4, 0.5, { label: '1 xícara', grams: 90 }),
  f('abobrinha', 'Abobrinha cozida', 'veg', 15, 1.1, 3.0, 0.2, { label: '1 colher de servir', grams: 60 }),
  f('beterraba', 'Beterraba cozida', 'veg', 32, 1.3, 7.2, 0.1, { label: '1 colher de sopa', grams: 25 }),
  f('pepino', 'Pepino', 'veg', 10, 0.9, 2.0, 0, { label: '1/2 unidade', grams: 100 }),
  f('repolho', 'Repolho', 'veg', 17, 0.9, 3.9, 0.1, { label: '1 colher de servir', grams: 50 }),
  f('couve', 'Couve refogada', 'veg', 90, 1.7, 8.7, 6.6, { label: '1 colher de servir', grams: 40 }),

  // Óleos, castanhas e pastas
  f('azeite', 'Azeite de oliva', 'fat', 884, 0, 0, 100, { label: '1 colher de sopa', grams: 13 }),
  f('oleo', 'Óleo de soja', 'fat', 884, 0, 0, 100, { label: '1 colher de sopa', grams: 13 }),
  f('manteiga', 'Manteiga', 'fat', 726, 0.4, 0.1, 82.4, { label: '1 colher de chá', grams: 5 }),
  f('pasta-amendoim', 'Pasta de amendoim', 'fat', 588, 25.0, 20.0, 50.0, { label: '1 colher de sopa', grams: 15 }),
  f('amendoim', 'Amendoim torrado', 'fat', 606, 22.5, 18.7, 54.0, { label: '1 punhado', grams: 25 }),
  f('castanha-para', 'Castanha-do-pará', 'fat', 643, 14.5, 15.1, 63.5, { label: '1 unidade', grams: 4 }),
  f('chia', 'Chia', 'fat', 486, 16.5, 42.1, 30.7, { label: '1 colher de sopa', grams: 12 }),

  // Bebidas
  f('cafe', 'Café sem açúcar', 'drink', 2, 0.1, 0.3, 0, { label: '1 xícara', grams: 100 }, true),
  f('suco-laranja', 'Suco de laranja natural', 'drink', 33, 0.7, 7.6, 0.1, { label: '1 copo', grams: 250 }, true),
  f('refrigerante', 'Refrigerante (normal)', 'drink', 40, 0, 10.4, 0, { label: '1 lata', grams: 350 }, true),
  f('cerveja', 'Cerveja', 'drink', 41, 0.3, 3.6, 0, { label: '1 lata', grams: 350 }, true),

  // Outros
  f('mel', 'Mel', 'other', 309, 0, 84.0, 0, { label: '1 colher de sopa', grams: 15 }),
  f('acucar', 'Açúcar', 'other', 387, 0, 99.5, 0, { label: '1 colher de chá', grams: 5 }),
  f('chocolate', 'Chocolate ao leite', 'other', 540, 7.2, 59.6, 30.3, { label: '1 quadradinho', grams: 5 }),
  f('pizza', 'Pizza de muçarela', 'other', 270, 11.0, 30.0, 12.0, { label: '1 fatia', grams: 110 }),
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((x) => [x.id, x]));

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Macros de uma quantidade (g ou ml) de um alimento da lista. */
export function macrosFor(food: Pick<Food, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>, grams: number): Macros {
  const k = grams / 100;
  return { kcal: Math.round(food.kcal * k), proteinG: r1(food.proteinG * k), carbsG: r1(food.carbsG * k), fatG: r1(food.fatG * k) };
}

/** Soma (itens sem número contam como zero). */
export function sumMacros(items: { [K in keyof Macros]?: number | null }[]): Macros {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const i of items) {
    t.kcal += i.kcal ?? 0;
    t.proteinG += i.proteinG ?? 0;
    t.carbsG += i.carbsG ?? 0;
    t.fatG += i.fatG ?? 0;
  }
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) };
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Busca sem acento: "feijao" acha "Feijão carioca cozido". */
export function searchFoods(q: string, limit = 12): Food[] {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return FOODS.filter((x) => {
    const name = fold(x.name);
    return terms.every((t) => name.includes(t));
  }).slice(0, limit);
}

/** Refeições comuns para começar um plano. */
export const MEAL_PRESETS = [
  { name: 'Café da manhã', time: '07:00' },
  { name: 'Lanche da manhã', time: '10:00' },
  { name: 'Almoço', time: '12:30' },
  { name: 'Lanche da tarde', time: '16:00' },
  { name: 'Pré-treino', time: '18:00' },
  { name: 'Jantar', time: '20:00' },
  { name: 'Ceia', time: '22:30' },
] as const;
