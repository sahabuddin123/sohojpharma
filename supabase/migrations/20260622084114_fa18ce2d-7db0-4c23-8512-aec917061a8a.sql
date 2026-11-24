
DROP FUNCTION IF EXISTS public.smart_medicine_search(text, int);

ALTER TABLE public.global_medicines
  ADD COLUMN IF NOT EXISTS generic_name_cached text,
  ADD COLUMN IF NOT EXISTS manufacturer_name_cached text;

UPDATE public.global_medicines gm SET generic_name_cached = gg.name
  FROM public.global_generics gg
 WHERE gg.id = gm.generic_id AND gm.generic_name_cached IS DISTINCT FROM gg.name;

UPDATE public.global_medicines gm SET manufacturer_name_cached = gmf.name
  FROM public.global_manufacturers gmf
 WHERE gmf.id = gm.manufacturer_id AND gm.manufacturer_name_cached IS DISTINCT FROM gmf.name;

UPDATE public.global_medicines SET search_tsv = to_tsvector('simple',
  coalesce(brand_name,'') || ' ' || coalesce(generic_name_cached,'') || ' ' ||
  coalesce(manufacturer_name_cached,'') || ' ' || coalesce(strength,''));

CREATE INDEX IF NOT EXISTS idx_gm_generic_cached_trgm
  ON public.global_medicines USING gin (generic_name_cached extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gm_mfr_cached_trgm
  ON public.global_medicines USING gin (manufacturer_name_cached extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.tg_gm_refresh_cached() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.generic_name_cached := (SELECT name FROM public.global_generics WHERE id = NEW.generic_id);
  NEW.manufacturer_name_cached := (SELECT name FROM public.global_manufacturers WHERE id = NEW.manufacturer_id);
  NEW.search_tsv := to_tsvector('simple',
    coalesce(NEW.brand_name,'') || ' ' || coalesce(NEW.generic_name_cached,'') || ' ' ||
    coalesce(NEW.manufacturer_name_cached,'') || ' ' || coalesce(NEW.strength,''));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gm_refresh_cached ON public.global_medicines;
CREATE TRIGGER trg_gm_refresh_cached
  BEFORE INSERT OR UPDATE OF brand_name, generic_id, manufacturer_id, strength
  ON public.global_medicines FOR EACH ROW EXECUTE FUNCTION public.tg_gm_refresh_cached();

CREATE FUNCTION public.smart_medicine_search(_q text, _limit int DEFAULT 25)
RETURNS TABLE(id uuid, brand_name text, generic_name text, manufacturer_name text,
              strength text, dosage_form text, score real, match_type text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH q AS (SELECT lower(coalesce(_q,'')) AS qq),
  bc AS (
    SELECT gm.id, 1.0::real AS score, 'barcode'::text AS match_type
    FROM global_barcodes b JOIN global_medicines gm ON gm.id = b.global_medicine_id
    WHERE b.barcode = _q
  ),
  trgm AS (
    SELECT gm.id,
      greatest(similarity(lower(gm.brand_name), (SELECT qq FROM q)),
               similarity(lower(coalesce(gm.generic_name_cached,'')), (SELECT qq FROM q)),
               similarity(lower(coalesce(gm.manufacturer_name_cached,'')), (SELECT qq FROM q))
              )::real AS score,
      'fuzzy'::text AS match_type
    FROM global_medicines gm
    WHERE (SELECT length(qq) FROM q) >= 2
      AND (gm.brand_name % _q OR gm.generic_name_cached % _q OR gm.manufacturer_name_cached % _q)
  ),
  alias_m AS (
    SELECT a.global_medicine_id AS id, 0.9::real AS score, 'alias'::text AS match_type
    FROM global_medicine_aliases a
    WHERE lower(a.alias) = (SELECT qq FROM q) OR a.alias ILIKE _q || '%'
  ),
  u AS (SELECT * FROM bc UNION ALL SELECT * FROM alias_m UNION ALL SELECT * FROM trgm),
  r AS (SELECT DISTINCT ON (id) id, score, match_type FROM u ORDER BY id, score DESC)
  SELECT r.id, gm.brand_name, gm.generic_name_cached, gm.manufacturer_name_cached,
         gm.strength, gm.dosage_form, r.score, r.match_type
  FROM r JOIN global_medicines gm ON gm.id = r.id
  ORDER BY r.score DESC, gm.brand_name LIMIT _limit;
$$;
GRANT EXECUTE ON FUNCTION public.smart_medicine_search(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public._classify_class(_gname text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY(
    SELECT cls FROM (VALUES
      ('Analgesic',        ARRAY['paracetamol','tramadol','ketorolac','codeine','morphine','pethidine']),
      ('NSAID',            ARRAY['ibuprofen','diclofenac','naproxen','etoricoxib','aceclofenac','mefenamic','indomethacin','piroxicam','ketoprofen','meloxicam','celecoxib','tolfenamic','flurbiprofen']),
      ('Antibiotic',       ARRAY['penicillin','amoxicillin','ampicillin','azithromycin','erythromycin','clarithromycin','cefixime','cefuroxime','ceftriaxone','cephradine','cephalexin','cefotaxime','cefepime','ciprofloxacin','levofloxacin','moxifloxacin','ofloxacin','doxycycline','tetracycline','clindamycin','metronidazole','flucloxacillin','gentamicin','vancomycin','linezolid','imipenem','meropenem','tigecycline','rifaximin','sulfamethoxazole','trimethoprim','nitrofurantoin']),
      ('Antihistamine',    ARRAY['cetirizine','levocetirizine','fexofenadine','loratadine','desloratadine','chlorpheniramine','hydroxyzine','diphenhydramine','ebastine','rupatadine','bilastine']),
      ('PPI',              ARRAY['omeprazole','esomeprazole','pantoprazole','lansoprazole','rabeprazole','dexlansoprazole','dexrabeprazole']),
      ('Antidiabetic',     ARRAY['metformin','glimepiride','gliclazide','sitagliptin','vildagliptin','linagliptin','empagliflozin','dapagliflozin','insulin','pioglitazone','glipizide','repaglinide']),
      ('Antihypertensive', ARRAY['amlodipine','losartan','valsartan','telmisartan','olmesartan','atenolol','bisoprolol','metoprolol','propranolol','enalapril','lisinopril','ramipril','perindopril','nebivolol','carvedilol','hydrochlorothiazide','indapamide','furosemide','spironolactone']),
      ('Antifungal',       ARRAY['fluconazole','itraconazole','ketoconazole','terbinafine','clotrimazole','miconazole','nystatin','voriconazole','griseofulvin']),
      ('Antiviral',        ARRAY['acyclovir','valacyclovir','oseltamivir','lamivudine','tenofovir','entecavir','sofosbuvir','remdesivir','favipiravir','molnupiravir']),
      ('Bronchodilator',   ARRAY['salbutamol','salmeterol','formoterol','ipratropium','theophylline','montelukast','tiotropium','indacaterol','doxofylline']),
      ('Corticosteroid',   ARRAY['prednisolone','dexamethasone','betamethasone','hydrocortisone','fluticasone','budesonide','methylprednisolone','triamcinolone','mometasone','deflazacort']),
      ('Vitamin/Supplement', ARRAY['vitamin','calcium','folic','iron','multivitamin','omega','zinc','magnesium','b-complex','cholecalciferol','cyanocobalamin','thiamine','riboflavin','niacin','pyridoxine','ferrous'])
    ) AS m(cls, kws)
    WHERE EXISTS (SELECT 1 FROM unnest(kws) k WHERE lower(_gname) LIKE '%' || k || '%')
  );
$$;

INSERT INTO public.global_medicine_therapeutic_classes (medicine_id, therapeutic_class_id)
SELECT gm.id, tc.id
FROM public.global_medicines gm
JOIN public.global_generics gg ON gg.id = gm.generic_id
CROSS JOIN LATERAL public._classify_class(gg.name) AS cls(names)
JOIN public.global_therapeutic_classes tc ON tc.name = ANY(cls.names)
ON CONFLICT DO NOTHING;

INSERT INTO public.global_medicine_alternatives
  (source_medicine_id, alternative_medicine_id, strength_match, generic_match, therapeutic_match, approved)
SELECT s.id, a.id, (s.strength IS NOT DISTINCT FROM a.strength), true, true, true
FROM public.global_medicines s
JOIN LATERAL (
  SELECT gm2.id, gm2.strength
  FROM public.global_medicines gm2
  WHERE gm2.generic_id = s.generic_id AND gm2.id <> s.id
    AND gm2.dosage_form IS NOT DISTINCT FROM s.dosage_form
  ORDER BY (gm2.strength IS NOT DISTINCT FROM s.strength) DESC, gm2.brand_name
  LIMIT 5
) a ON true
WHERE s.generic_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._seed_interactions(
  _ga text, _gb text, _sev drug_interaction_severity,
  _desc text, _eff text, _rec text) RETURNS void
LANGUAGE sql SET search_path = public AS $$
  INSERT INTO public.global_drug_interactions
    (medicine_a, medicine_b, severity, description, clinical_effect, recommendation)
  SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id), _sev, _desc, _eff, _rec
  FROM public.global_medicines a JOIN public.global_generics ga ON ga.id=a.generic_id
  JOIN public.global_medicines b ON b.id <> a.id
  JOIN public.global_generics gb ON gb.id=b.generic_id
  WHERE lower(ga.name) LIKE '%'||_ga||'%' AND lower(gb.name) LIKE '%'||_gb||'%' AND a.id < b.id
  ON CONFLICT DO NOTHING;
$$;

SELECT public._seed_interactions('warfarin','aspirin','major','Bleeding risk','Increased anticoagulation','Avoid combination');
SELECT public._seed_interactions('warfarin','ibuprofen','major','Bleeding risk','Increased INR','Avoid; monitor closely');
SELECT public._seed_interactions('warfarin','metronidazole','major','Bleeding risk','Increased anticoagulation','Reduce warfarin dose');
SELECT public._seed_interactions('clopidogrel','omeprazole','moderate','Reduced antiplatelet effect','Decreased clopidogrel activation','Use pantoprazole');
SELECT public._seed_interactions('simvastatin','clarithromycin','major','Myopathy risk','Statin level increases','Hold statin during course');
SELECT public._seed_interactions('simvastatin','erythromycin','major','Myopathy risk','Statin level increases','Avoid combination');
SELECT public._seed_interactions('ciprofloxacin','theophylline','major','Theophylline toxicity','Increased levels','Avoid or monitor');
SELECT public._seed_interactions('azithromycin','warfarin','moderate','Bleeding risk','Increased INR','Monitor INR');
SELECT public._seed_interactions('fluconazole','warfarin','major','Bleeding','Increased INR','Reduce warfarin dose');
SELECT public._seed_interactions('digoxin','furosemide','moderate','Digoxin toxicity','Hypokalemia potentiates','Monitor K and digoxin');
SELECT public._seed_interactions('lisinopril','spironolactone','moderate','Hyperkalemia','Additive K retention','Monitor potassium');
SELECT public._seed_interactions('losartan','spironolactone','moderate','Hyperkalemia','Additive K retention','Monitor potassium');
SELECT public._seed_interactions('metoprolol','verapamil','major','Bradycardia/AV block','Additive cardiac depression','Avoid combination');
SELECT public._seed_interactions('sildenafil','nitroglycerin','major','Severe hypotension','Vasodilator synergy','Contraindicated');
SELECT public._seed_interactions('tramadol','sertraline','moderate','Serotonin syndrome','Additive serotonin','Avoid or monitor');
SELECT public._seed_interactions('ibuprofen','lisinopril','moderate','Reduced antihypertensive effect','Renal prostaglandin block','Monitor BP and renal');

INSERT INTO public.global_dosage_guides (medicine_id, adult_dose, child_dose, max_daily_dose, renal_adjustment, hepatic_adjustment, administration_notes)
SELECT gm.id, d.adult, d.child, d.maxd, d.renal, d.hepatic, d.notes
FROM public.global_medicines gm
JOIN public.global_generics gg ON gg.id = gm.generic_id
JOIN LATERAL (
  SELECT * FROM (VALUES
    ('paracetamol',   '500–1000 mg every 4–6 h', '10–15 mg/kg every 4–6 h', '4 g/day', 'Avoid in severe impairment', 'Avoid in severe impairment', 'Take with or without food'),
    ('ibuprofen',     '200–400 mg every 4–6 h', '5–10 mg/kg every 6–8 h', '2400 mg/day', 'Avoid CrCl <30', 'Use caution', 'Take with food'),
    ('amoxicillin',   '500 mg every 8 h', '25–50 mg/kg/day in 3 doses', '3 g/day', 'Reduce in CrCl <30', 'No adjustment', 'With/without food'),
    ('azithromycin',  '500 mg once daily x 3 days', '10 mg/kg/day x 3 days', '500 mg/day', 'No adjustment', 'Use caution', '1 h before or 2 h after meals'),
    ('ciprofloxacin', '500 mg every 12 h', 'Not recommended <18 y', '1500 mg/day', 'CrCl <30: every 24 h', 'No adjustment', 'Avoid dairy concurrently'),
    ('metformin',     '500 mg twice daily', 'Not recommended <10 y', '2000 mg/day', 'Avoid CrCl <30', 'Avoid', 'Take with meals'),
    ('omeprazole',    '20 mg once daily', '0.7–3.3 mg/kg/day', '40 mg/day', 'No adjustment', 'Reduce dose', '30 min before meals'),
    ('esomeprazole',  '20–40 mg once daily', '10–20 mg once daily', '40 mg/day', 'No adjustment', 'Reduce dose', '1 h before meals'),
    ('losartan',      '50 mg once daily', 'Not recommended <6 y', '100 mg/day', 'Use caution', 'Reduce dose', 'With/without food'),
    ('amlodipine',    '5 mg once daily', 'Not recommended <6 y', '10 mg/day', 'No adjustment', 'Reduce dose', 'With/without food'),
    ('atorvastatin',  '10–20 mg once daily', 'Not recommended <10 y', '80 mg/day', 'No adjustment', 'Contraindicated in active disease', 'Any time of day'),
    ('cetirizine',    '10 mg once daily', '5 mg once daily (6–11 y)', '10 mg/day', 'Reduce CrCl <30', 'Reduce dose', 'With/without food'),
    ('fexofenadine',  '120–180 mg once daily', '30 mg twice daily (6–11 y)', '180 mg/day', 'Reduce CrCl <80', 'No adjustment', 'Avoid fruit juice'),
    ('montelukast',   '10 mg once daily evening', '5 mg evening (6–14 y)', '10 mg/day', 'No adjustment', 'Use caution', 'Evening dose'),
    ('metronidazole', '400 mg every 8 h', '7.5 mg/kg every 8 h', '4 g/day', 'No adjustment', 'Reduce dose', 'Avoid alcohol'),
    ('diclofenac',    '50 mg every 8 h', 'Not recommended <14 y', '150 mg/day', 'Avoid CrCl <30', 'Use caution', 'Take with food'),
    ('prednisolone',  '5–60 mg/day', '0.1–2 mg/kg/day', 'Variable', 'No adjustment', 'Use caution', 'With food, taper gradually'),
    ('salbutamol',    '2–4 mg 3–4 times/day or 100–200 mcg inhaler', '0.1 mg/kg', '32 mg/day', 'No adjustment', 'No adjustment', 'Prime inhaler before first use'),
    ('fluconazole',   '150 mg single dose or 50–400 mg daily', '3–12 mg/kg/day', '400 mg/day', 'Reduce CrCl <50', 'Use caution', 'With/without food'),
    ('cephradine',    '500 mg every 6 h', '25–50 mg/kg/day in 4 doses', '4 g/day', 'Reduce in renal impairment', 'No adjustment', 'With/without food'),
    ('cefixime',      '400 mg once daily', '8 mg/kg/day', '400 mg/day', 'Reduce CrCl <60', 'No adjustment', 'With/without food'),
    ('cefuroxime',    '250–500 mg every 12 h', '10–15 mg/kg every 12 h', '1 g/day', 'Reduce CrCl <30', 'No adjustment', 'With food for absorption')
  ) AS t(kw, adult, child, maxd, renal, hepatic, notes)
  WHERE lower(gg.name) LIKE '%' || t.kw || '%' LIMIT 1
) d ON true
ON CONFLICT (medicine_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._seed_contras(_kw text, _conds text[], _sev drug_interaction_severity)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  INSERT INTO public.global_contraindications (medicine_id, condition, severity, notes)
  SELECT gm.id, c.cond, _sev, 'Auto-classified from generic'
  FROM public.global_medicines gm JOIN public.global_generics gg ON gg.id=gm.generic_id
  CROSS JOIN unnest(_conds) AS c(cond)
  WHERE lower(gg.name) LIKE '%'||_kw||'%'
  ON CONFLICT DO NOTHING;
$$;

SELECT public._seed_contras('ibuprofen',   ARRAY['Pregnancy (3rd trimester)','Kidney Disease','Active GI Bleed','Asthma'],   'major');
SELECT public._seed_contras('diclofenac',  ARRAY['Pregnancy (3rd trimester)','Kidney Disease','Active GI Bleed','Asthma'],   'major');
SELECT public._seed_contras('naproxen',    ARRAY['Pregnancy','Kidney Disease','Active GI Bleed','Asthma'],                   'moderate');
SELECT public._seed_contras('aceclofenac', ARRAY['Pregnancy','Kidney Disease','Asthma'],                                     'moderate');
SELECT public._seed_contras('etoricoxib',  ARRAY['Pregnancy','Severe Hypertension','Heart Failure','Kidney Disease'],        'major');
SELECT public._seed_contras('aspirin',     ARRAY['Pregnancy','Active GI Bleed','Children <16 y (Reye syndrome)'],            'major');
SELECT public._seed_contras('paracetamol', ARRAY['Severe Liver Disease'],                                                    'moderate');
SELECT public._seed_contras('metformin',   ARRAY['Severe Kidney Disease (eGFR <30)','Acute Heart Failure'],                  'major');
SELECT public._seed_contras('losartan',    ARRAY['Pregnancy','Bilateral Renal Artery Stenosis'],                             'major');
SELECT public._seed_contras('valsartan',   ARRAY['Pregnancy'],                                                               'major');
SELECT public._seed_contras('lisinopril',  ARRAY['Pregnancy','Angioedema history'],                                          'major');
SELECT public._seed_contras('enalapril',   ARRAY['Pregnancy'],                                                               'major');
SELECT public._seed_contras('atenolol',    ARRAY['Asthma','Severe Bradycardia'],                                             'moderate');
SELECT public._seed_contras('propranolol', ARRAY['Asthma','AV Block'],                                                       'major');
SELECT public._seed_contras('metoprolol',  ARRAY['Asthma','Severe Bradycardia'],                                             'moderate');
SELECT public._seed_contras('warfarin',    ARRAY['Pregnancy','Active Bleeding'],                                             'major');
SELECT public._seed_contras('clopidogrel', ARRAY['Active Bleeding'],                                                         'major');
SELECT public._seed_contras('ciprofloxacin', ARRAY['Pregnancy','Children','Tendon disorders'],                               'moderate');
SELECT public._seed_contras('doxycycline', ARRAY['Pregnancy','Children <8 y'],                                               'major');
SELECT public._seed_contras('metronidazole', ARRAY['Pregnancy (1st trimester)','Alcohol use'],                               'moderate');
SELECT public._seed_contras('fluconazole', ARRAY['Pregnancy','Liver Disease'],                                               'moderate');
SELECT public._seed_contras('isotretinoin', ARRAY['Pregnancy'],                                                              'major');
SELECT public._seed_contras('simvastatin', ARRAY['Pregnancy','Active Liver Disease'],                                        'major');
SELECT public._seed_contras('atorvastatin', ARRAY['Pregnancy','Active Liver Disease'],                                       'major');
SELECT public._seed_contras('prednisolone', ARRAY['Active Systemic Infection','Live Vaccines'],                              'moderate');
SELECT public._seed_contras('salbutamol',  ARRAY['Severe Cardiac Arrhythmia'],                                               'minor');
SELECT public._seed_contras('codeine',     ARRAY['Children <12 y','Pregnancy','Breastfeeding'],                              'major');
SELECT public._seed_contras('tramadol',    ARRAY['Seizure disorder','Children <12 y'],                                       'moderate');

UPDATE public.global_medicines gm SET pregnancy_category = sub.cat
FROM (
  SELECT gm2.id, CASE
    WHEN lower(gg.name) ~ 'warfarin|isotretinoin|methotrexate|misoprostol|valproate|thalidomide|ribavirin|leflunomide|doxycycline|tetracycline|losartan|valsartan|telmisartan|olmesartan|lisinopril|enalapril|ramipril|simvastatin|atorvastatin' THEN 'X'
    WHEN lower(gg.name) ~ 'ibuprofen|diclofenac|naproxen|etoricoxib|aspirin|fluconazole|aceclofenac|ciprofloxacin|levofloxacin|moxifloxacin' THEN 'D'
    WHEN lower(gg.name) ~ 'omeprazole|esomeprazole|atenolol|propranolol|metoprolol|amlodipine|metronidazole|gentamicin|hydrochlorothiazide|furosemide' THEN 'C'
    WHEN lower(gg.name) ~ 'paracetamol|amoxicillin|cephradine|cefixime|cefuroxime|ceftriaxone|azithromycin|erythromycin|clindamycin|insulin|metformin|cetirizine|loratadine|fexofenadine|prednisolone' THEN 'B'
    ELSE NULL END AS cat
  FROM public.global_medicines gm2 JOIN public.global_generics gg ON gg.id=gm2.generic_id
) sub WHERE gm.id = sub.id AND sub.cat IS NOT NULL;

UPDATE public.global_medicines gm SET lactation_warning = 'Consult prescriber before use during breastfeeding'
FROM public.global_generics gg WHERE gm.generic_id=gg.id
  AND lower(gg.name) ~ 'codeine|tramadol|doxycycline|tetracycline|metronidazole|ciprofloxacin|amiodarone|lithium|methotrexate|isotretinoin|chloramphenicol';

UPDATE public.global_medicines gm SET pediatric_warning = 'Not recommended in young children'
FROM public.global_generics gg WHERE gm.generic_id=gg.id
  AND lower(gg.name) ~ 'ciprofloxacin|levofloxacin|moxifloxacin|doxycycline|tetracycline|aspirin|codeine|tramadol|isotretinoin';

UPDATE public.global_medicines gm SET geriatric_warning = 'Use lowest effective dose; monitor renal function'
FROM public.global_generics gg WHERE gm.generic_id=gg.id
  AND lower(gg.name) ~ 'diazepam|alprazolam|amitriptyline|diphenhydramine|hydroxyzine|chlorpheniramine|ibuprofen|diclofenac|naproxen|digoxin|warfarin';

UPDATE public.global_medicines gm SET otc_allowed = false, prescription_required = true
FROM public.global_generics gg WHERE gm.generic_id=gg.id
  AND lower(gg.name) ~ 'amoxicillin|azithromycin|ciprofloxacin|levofloxacin|moxifloxacin|cefixime|cefuroxime|ceftriaxone|cephradine|cephalexin|doxycycline|tetracycline|clindamycin|metronidazole|flucloxacillin|gentamicin|vancomycin|linezolid|imipenem|meropenem|warfarin|insulin|isotretinoin|methotrexate|simvastatin|atorvastatin|rosuvastatin|losartan|valsartan|telmisartan|lisinopril|enalapril|ramipril|amlodipine|atenolol|metoprolol|propranolol|carvedilol|metformin|glimepiride|gliclazide|sitagliptin|empagliflozin|dapagliflozin|prednisolone|dexamethasone|methylprednisolone|tramadol|codeine|morphine|fluconazole|itraconazole|voriconazole|acyclovir|valacyclovir|tenofovir|entecavir|sofosbuvir';

UPDATE public.global_medicines gm SET otc_allowed = true, prescription_required = false
FROM public.global_generics gg WHERE gm.generic_id=gg.id
  AND lower(gg.name) ~ '^(paracetamol|ibuprofen|cetirizine|loratadine|fexofenadine|levocetirizine|omeprazole|esomeprazole|pantoprazole|antacid|ranitidine|domperidone|ors|calcium|vitamin|multivitamin|folic|iron|zinc|magnesium|b-?complex|cholecalciferol)';

INSERT INTO public.global_medicine_aliases (global_medicine_id, alias, lang)
SELECT gm.id, lower(gm.brand_name), 'en' FROM public.global_medicines gm
ON CONFLICT DO NOTHING;

INSERT INTO public.global_medicine_aliases (global_medicine_id, alias, lang)
SELECT gm.id, split_part(lower(gm.brand_name), ' ', 1), 'en' FROM public.global_medicines gm
WHERE position(' ' in gm.brand_name) > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.global_medicine_aliases (global_medicine_id, alias, lang)
SELECT gm.id, lower(gg.name), 'en'
FROM public.global_medicines gm JOIN public.global_generics gg ON gg.id=gm.generic_id
ON CONFLICT DO NOTHING;

DROP MATERIALIZED VIEW IF EXISTS public.mv_clinical_dashboard;
CREATE MATERIALIZED VIEW public.mv_clinical_dashboard AS
SELECT 1 AS singleton,
  (SELECT count(*) FROM public.global_medicines) AS total_medicines,
  (SELECT count(DISTINCT medicine_id) FROM public.global_medicine_therapeutic_classes) AS classified_medicines,
  (SELECT count(DISTINCT source_medicine_id) FROM public.global_medicine_alternatives) AS with_alternatives,
  (SELECT count(*) FROM public.global_medicine_alternatives) AS alt_rows,
  (SELECT count(*) FROM public.global_drug_interactions) AS interactions,
  (SELECT count(*) FROM public.global_drug_interactions WHERE severity='major') AS major_interactions,
  (SELECT count(*) FROM public.global_drug_interactions WHERE severity='moderate') AS moderate_interactions,
  (SELECT count(*) FROM public.global_drug_interactions WHERE severity='minor') AS minor_interactions,
  (SELECT count(DISTINCT medicine_id) FROM public.global_dosage_guides) AS with_dosage,
  (SELECT count(DISTINCT medicine_id) FROM public.global_contraindications) AS with_contras,
  (SELECT count(*) FROM public.global_medicines WHERE pregnancy_category IS NOT NULL) AS with_pregnancy,
  (SELECT count(*) FROM public.global_medicines WHERE lactation_warning IS NOT NULL) AS with_lactation,
  (SELECT count(*) FROM public.global_medicines WHERE pediatric_warning IS NOT NULL) AS with_pediatric,
  (SELECT count(*) FROM public.global_medicines WHERE geriatric_warning IS NOT NULL) AS with_geriatric,
  now() AS refreshed_at;

CREATE UNIQUE INDEX ON public.mv_clinical_dashboard (singleton);
GRANT SELECT ON public.mv_clinical_dashboard TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_clinical_dashboard() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_clinical_dashboard;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_clinical_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_clinical_dashboard() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT to_jsonb(m) FROM public.mv_clinical_dashboard m LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_clinical_dashboard() TO authenticated;

ANALYZE public.global_medicines;
ANALYZE public.global_medicine_alternatives;
ANALYZE public.global_medicine_therapeutic_classes;
ANALYZE public.global_dosage_guides;
ANALYZE public.global_contraindications;
ANALYZE public.global_medicine_aliases;

REFRESH MATERIALIZED VIEW public.mv_clinical_dashboard;
