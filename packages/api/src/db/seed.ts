/**
 * Seed database with initial taxonomy categories and packs.
 */

import type { DbClient } from './database.js';

export async function seedDatabase(db: DbClient): Promise<void> {
  const existing = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM taxonomy_categories');
  if (existing && existing.count > 0) return;

  console.log('[Seed] Populating taxonomy categories and packs...');

  // Layer 1: Universal dimensions
  const universals: [string, string, string, string, number][] = [
    ['violence', 'Violence', 'Physical harm, fighting, injury, death', 'skip', 1],
    ['sexual_content', 'Sexual Content', 'Sexual activity, implied or explicit', 'skip', 2],
    ['language', 'Language', 'Profanity, slurs, crude language', 'mute', 2],
    ['nudity', 'Nudity', 'Exposed nudity, partial or full', 'blur', 2],
    ['substances', 'Substances', 'Drug use, alcohol, smoking', 'skip', 0],
    ['fear', 'Fear/Horror', 'Jump scares, horror, disturbing imagery', 'skip', 0],
  ];

  for (const [id, name, desc, action, threshold] of universals) {
    await db.run(
      `INSERT INTO taxonomy_categories (id, layer, name, description, default_action, default_threshold, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'system', 'active')
       ON CONFLICT (id) DO NOTHING`,
      id, 1, name, desc, action, threshold,
    );
  }

  // Layer 2: Catholic blasphemy categories
  const blasphemyCategories: [string, string, string, string, number][] = [
    ['blasphemy', 'Blasphemy', 'Taking the Lord\'s name in vain (CCC 2142-2167)', 'mute', 3],
    ['blasphemy.gods_name', 'God\'s Name in Vain', 'Using God, Lord, Almighty as expletives', 'mute', 3],
    ['blasphemy.jesus_name', 'Holy Name of J*sus', 'Profane use of J*sus, Ch**st as exclamations', 'mute', 3],
    ['blasphemy.holy_family', 'Mary, Joseph & Our Lady', 'Mary, Joseph and Our Lady used as oaths or exclamations', 'mute', 2],
    ['blasphemy.saints', 'The Saints', 'The saints invoked as oaths or exclamations', 'mute', 2],
    ['blasphemy.sacred_mockery', 'Sacred Mockery', 'Mocking prayer, sacraments, clergy, sacred objects', 'skip', 2],
    ['blasphemy.demonic', 'Demonic Glorification', 'Positive portrayal of Satan, demons, the occult', 'skip', 2],
  ];

  for (const [id, name, desc, action, threshold] of blasphemyCategories) {
    await db.run(
      `INSERT INTO taxonomy_categories (id, layer, name, description, default_action, default_threshold, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'system', 'active')
       ON CONFLICT (id) DO NOTHING`,
      id, 2, name, desc, action, threshold,
    );
  }

  // Layer 2: Refined sub-categories
  const refinedCategories: [string, string, string, string, number][] = [
    ['violence.graphic', 'Graphic Violence', 'Realistic, brutal, or sustained violence', 'skip', 1],
    ['violence.moderate', 'Moderate Violence', 'Fighting, hitting, non-graphic conflict', 'skip', 2],
    ['violence.mild', 'Mild Violence', 'Slapping, shoving, slapstick', 'skip', 3],
    ['violence.gore', 'Gore', 'Blood, body horror, mutilation', 'skip', 1],
    ['violence.domestic', 'Domestic Violence', 'Violence within family/partner relationships', 'skip', 1],
    ['violence.gun', 'Gun Violence', 'Shooting, firearms used against people', 'skip', 1],
    ['violence.self_harm', 'Self-Harm', 'Cutting, suicide attempts, self-injury', 'skip', 1],
    ['language.profanity', 'Profanity', 'F-word, s-word, general swearing', 'mute', 2],
    ['language.slur', 'Slurs', 'Racial, ethnic, gender-based slurs', 'mute', 1],
    ['language.crude', 'Crude Language', 'Vulgar but non-profane language', 'mute', 3],
    ['language.sexual_reference', 'Sexual References', 'Sexual innuendo, explicit talk', 'mute', 2],
    ['substances.drugs', 'Drug Use', 'Illegal drug use, dealing, overdose', 'skip', 1],
    ['substances.alcohol', 'Alcohol', 'Drinking, intoxication, binge drinking', 'skip', 0],
    ['substances.smoking', 'Smoking', 'Cigarettes, vaping, tobacco use', 'skip', 0],
    ['fear.horror', 'Horror', 'Jump scares, supernatural horror, monsters', 'skip', 1],
    ['fear.disturbing', 'Disturbing Content', 'Psychologically disturbing imagery', 'skip', 1],
    ['trigger.sexual_assault', 'Sexual Assault', 'Rape, sexual coercion, assault', 'skip', 1],
    ['trigger.child_abuse', 'Child Abuse', 'Violence or abuse against children', 'skip', 1],
    ['trigger.eating_disorder', 'Eating Disorder', 'Anorexia, bulimia, disordered eating', 'skip', 1],
    ['trigger.suicide', 'Suicide', 'Suicide attempts, completed suicide, ideation', 'skip', 1],
    ['trigger.animal_harm', 'Animal Harm', 'Animals injured or killed', 'skip', 2],
    ['trigger.flashing_lights', 'Flashing Lights', 'Strobe effects, rapid flashing (photosensitivity)', 'skip', 1],
  ];

  for (const [id, name, desc, action, threshold] of refinedCategories) {
    await db.run(
      `INSERT INTO taxonomy_categories (id, layer, name, description, default_action, default_threshold, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'system', 'active')
       ON CONFLICT (id) DO NOTHING`,
      id, 2, name, desc, action, threshold,
    );
  }

  // Category Packs
  const packs: [string, string, string, string, object[], string[]][] = [
    [
      'catholic-family', 'Catholic Family',
      'Comprehensive filter aligned with Catholic teaching. Blasphemy, profanity, nudity, and violence.',
      'system',
      [
        { categoryId: 'blasphemy', threshold: 3, action: 'mute' },
        { categoryId: 'blasphemy.sacred_mockery', threshold: 2, action: 'skip' },
        { categoryId: 'blasphemy.demonic', threshold: 2, action: 'skip' },
        { categoryId: 'language.profanity', threshold: 2, action: 'mute' },
        { categoryId: 'language.slur', threshold: 1, action: 'mute' },
        { categoryId: 'nudity', threshold: 2, action: 'blur' },
        { categoryId: 'sexual_content', threshold: 2, action: 'skip' },
        { categoryId: 'violence.graphic', threshold: 1, action: 'skip' },
        { categoryId: 'violence.gore', threshold: 1, action: 'skip' },
        { categoryId: 'trigger.sexual_assault', threshold: 1, action: 'skip' },
      ],
      ['catholic', 'family', 'faith-based'],
    ],
    [
      'young-kids-5-8', 'Young Kids (5-8)',
      'Strict filtering for young children. Blocks most violence, all language, all nudity.',
      'system',
      [
        { categoryId: 'violence', threshold: 2, action: 'skip' },
        { categoryId: 'fear', threshold: 2, action: 'skip' },
        { categoryId: 'language', threshold: 3, action: 'mute' },
        { categoryId: 'nudity', threshold: 3, action: 'blur' },
        { categoryId: 'sexual_content', threshold: 3, action: 'skip' },
        { categoryId: 'substances', threshold: 2, action: 'skip' },
        { categoryId: 'blasphemy', threshold: 3, action: 'mute' },
      ],
      ['kids', 'family', 'strict'],
    ],
    [
      'clean-language', 'Clean Language Only',
      'Filters all profanity, slurs, blasphemy, and crude language. Does not filter visual content.',
      'system',
      [
        { categoryId: 'language', threshold: 3, action: 'mute' },
        { categoryId: 'blasphemy', threshold: 3, action: 'mute' },
      ],
      ['language', 'profanity', 'minimal'],
    ],
    [
      'trauma-informed', 'Trauma-Informed',
      'Filters specific triggers: sexual assault, domestic violence, self-harm, suicide, child abuse.',
      'system',
      [
        { categoryId: 'trigger.sexual_assault', threshold: 1, action: 'skip' },
        { categoryId: 'trigger.child_abuse', threshold: 1, action: 'skip' },
        { categoryId: 'trigger.suicide', threshold: 1, action: 'skip' },
        { categoryId: 'trigger.eating_disorder', threshold: 1, action: 'skip' },
        { categoryId: 'violence.domestic', threshold: 1, action: 'skip' },
        { categoryId: 'violence.self_harm', threshold: 1, action: 'skip' },
      ],
      ['trauma', 'triggers', 'mental-health'],
    ],
  ];

  for (const [id, name, desc, author, categories, tags] of packs) {
    await db.run(
      `INSERT INTO category_packs (id, name, description, author, categories_json, subscribers, tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      id, name, desc, author, JSON.stringify(categories), 0, JSON.stringify(tags),
    );
  }

  console.log('[Seed] Done: 33 categories, 4 packs');
}
