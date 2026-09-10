
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'

type MoveDetail = { moveId:string, uses:number }
type Match = { opponent:string, rating:number }
type PokemonEntry = {
  speciesId:string,
  speciesName:string,
  score:number,
  moveset:string[],
  moves:{ fastMoves: MoveDetail[], chargedMoves: MoveDetail[] },
  matchups: Match[],
  counters: Match[],
  scores:number[],
  stats:{ atk:number, def:number, hp:number, product:number },
  rank_old?:number,
  rank?:number
}

type MoveFull = {
  moveId:string, name:string, nameEs:string, type:string,
  power:number, energy:number, energyGain:number, isFast:number, cooldown:number, turns:number,
  buffs?: [number, number], buffTarget?: 'self'|'opponent', buffApplyChance?: number
}

// Formato de cada movimiento dentro del archivo que se descarga para actualizar
// los movimientos de la próxima temporada (moves_actualizados.json). Ese archivo
// puede venir como array plano, o como export completo tipo "gamemaster" con los
// movimientos anidados en la clave "moves" (así es como lo genera el usuario).
// buffs = [cambio de Ataque, cambio de Defensa] en niveles (-4 a +4), buffTarget
// indica a quién afecta, y buffApplyChance la probabilidad (0 a 1) de que ocurra.
type MoveOverride = {
  moveId:string, name:string, type:string, power:number, energy:number,
  energyGain:number, cooldown:number, turns:number,
  buffs?: [number, number], buffTarget?: 'self'|'opponent', buffApplyChance?: number|string
}

type Compared = {
  id:string, name:string, oldRank:number, newRank:number, delta:number, mejora:number,
  old: PokemonEntry, cur: PokemonEntry, tipos:string[]
}

type LigaKey = 'super' | 'ultra' | 'master'
type ThemeKey = 'dark' | 'light'

const LIGAS: Record<LigaKey, { label:string, folder:string, oldLabel:string, newLabel:string, className:string }> = {
  super:  { label:'LIGA SUPER',  folder:'super',  oldLabel:'Siempre Adelante',   newLabel:'Caminos Crepusculares', className:'league-super' },
  ultra:  { label:'LIGA ULTRA',  folder:'ultra',  oldLabel:'Temporada Anterior', newLabel:'Temporada Actual',      className:'league-ultra' },
  master: { label:'LIGA MASTER', folder:'master', oldLabel:'Temporada Anterior', newLabel:'Temporada Actual',      className:'league-master' },
}

// Tope de CP por liga. Master no tiene tope real en el juego (cualquier CP entra),
// por eso ahí el mejor IV siempre es 15/15/15 sin necesidad de búsqueda.
const CP_CAPS: Record<LigaKey, number | null> = { super: 1500, ultra: 2500, master: null }

// Tabla oficial de multiplicadores de CP (CPM) por nivel, en pasos de 0.5,
// extraída y verificada directamente del código fuente de PvPoke (Pokemon.js):
// cpms[0] = nivel 1, cpms[1] = nivel 1.5, cpms[2] = nivel 2, ... índice = (nivel-1)*2
const CPMS: number[] = [0.0939999967813491,0.135137430784308,0.166397869586944,0.192650914456886,0.215732470154762,0.236572655026622,0.255720049142837,0.273530381100769,0.290249884128570,0.306057381335773,0.321087598800659,0.335445032295077,0.349212676286697,0.362457748778790,0.375235587358474,0.387592411085168,0.399567276239395,0.411193549517250,0.422500014305114,0.432926413410414,0.443107545375824,0.453059953871985,0.462798386812210,0.472336077786704,0.481684952974319,0.490855810259008,0.499858438968658,0.508701756943992,0.517393946647644,0.525942508771329,0.534354329109191,0.542635762230353,0.550792694091796,0.558830599438087,0.566754519939422,0.574569148039264,0.582278907299041,0.589887911977272,0.597400009632110,0.604823657502073,0.612157285213470,0.619404110566050,0.626567125320434,0.633649181622743,0.640652954578399,0.647580963301656,0.654435634613037,0.661219263506722,0.667934000492096,0.674581899290818,0.681164920330047,0.687684905887771,0.694143652915954,0.700542893277978,0.706884205341339,0.713169102333341,0.719399094581604,0.725575616972598,0.731700003147125,0.734741011137376,0.737769484519958,0.740785574597326,0.743789434432983,0.746781208702482,0.749761044979095,0.752729105305821,0.755685508251190,0.758630366519684,0.761563837528228,0.764486065255226,0.767397165298461,0.770297273971590,0.773186504840850,0.776064945942412,0.778932750225067,0.781790064808426,0.784636974334716,0.787473583646825,0.790300011634826,0.792803950958807,0.795300006866455,0.797803921486970,0.800300002098083,0.802803892322847,0.805299997329711,0.807803863460723,0.810299992561340,0.812803834895026,0.815299987792968,0.817803806620319,0.820299983024597,0.822803778631297,0.825299978256225,0.827803750922782,0.830299973487854,0.832803753381377,0.835300028324127,0.837803755931569,0.840300023555755,0.842803729034748,0.845300018787384,0.847803702398935,0.850300014019012,0.852803676019539,0.855300009250640,0.857803649892077,0.860300004482269,0.862803624012168,0.865299999713897]

type BestIVResult = { level:number, atk:number, def:number, hp:number, cp:number, product:number, statAtk:number, statDef:number, statHp:number }

/** Calcula el CP dado un CPM y stats base+IV, con la misma fórmula que usa el juego/PvPoke. */
function calcCP(baseAtk:number, baseDef:number, baseHp:number, atkIV:number, defIV:number, hpIV:number, cpm:number){
  return Math.floor(((baseAtk+atkIV) * Math.pow(baseDef+defIV, 0.5) * Math.pow(baseHp+hpIV, 0.5) * cpm * cpm) / 10)
}

/** Stats reales (Ataque/Defensa/Salud) de un Pokémon a un nivel e IV específicos. */
function statsAtLevel(baseAtk:number, baseDef:number, baseHp:number, atkIV:number, defIV:number, hpIV:number, level:number){
  const idx = Math.round((level-1)*2)
  const cpm = CPMS[Math.max(0, Math.min(CPMS.length-1, idx))]
  return { atk: cpm*(baseAtk+atkIV), def: cpm*(baseDef+defIV), hp: Math.floor(cpm*(baseHp+hpIV)) }
}

/**
 * Busca la combinación de IV (0-15 cada uno) y nivel que da el MAYOR stat product
 * (Ataque x Defensa x Salud) sin pasarse del tope de CP de la liga. Es el mismo
 * algoritmo de fuerza bruta que usa PvPoke internamente para su "Rank 1".
 * Si cpCap es null (Liga Master, sin tope), el resultado siempre es 15/15/15 al
 * nivel máximo, sin necesidad de buscar.
 */
function findBestIV(baseAtk:number, baseDef:number, baseHp:number, cpCap:number|null): BestIVResult {
  const maxLevelIdx = CPMS.length - 1 // nivel máximo disponible en la tabla
  if(cpCap===null){
    const cpm = CPMS[Math.min(100, maxLevelIdx)] // nivel 51 (índice 100)
    const cp = calcCP(baseAtk, baseDef, baseHp, 15, 15, 15, cpm)
    const atk = cpm*(baseAtk+15), def = cpm*(baseDef+15), hp = Math.floor(cpm*(baseHp+15))
    return { level:51, atk:15, def:15, hp:15, cp, product: atk*def*hp, statAtk:atk, statDef:def, statHp:hp }
  }

  let best: BestIVResult | null = null
  for(let atkIV=0; atkIV<=15; atkIV++){
    for(let defIV=0; defIV<=15; defIV++){
      for(let hpIV=0; hpIV<=15; hpIV++){
        // Buscar el nivel más alto (hasta 51, en pasos de 0.5) que no exceda el tope de CP
        let lo = 0, hi = Math.min(100, maxLevelIdx) // índice de nivel 1 a 51
        let bestIdx = 0
        while(lo<=hi){
          const mid = (lo+hi)>>1
          const cpm = CPMS[mid]
          const cp = calcCP(baseAtk, baseDef, baseHp, atkIV, defIV, hpIV, cpm)
          if(cp<=cpCap){ bestIdx = mid; lo = mid+1 } else { hi = mid-1 }
        }
        const cpm = CPMS[bestIdx]
        const cp = calcCP(baseAtk, baseDef, baseHp, atkIV, defIV, hpIV, cpm)
        if(cp===0 || cp>cpCap) continue
        const atk = cpm*(baseAtk+atkIV), def = cpm*(baseDef+defIV), hp = Math.floor(cpm*(baseHp+hpIV))
        const product = atk*def*hp
        if(!best || product>best.product){
          best = { level: 1 + bestIdx/2, atk:atkIV, def:defIV, hp:hpIV, cp, product, statAtk:atk, statDef:def, statHp:hp }
        }
      }
    }
  }
  return best as BestIVResult
}

// ---------------------------------------------------------------------------
// Tabla de tipos (efectividad estándar de Pokémon, igual en Pokémon GO) y
// funciones para calcular debilidades/resistencias, usadas para recomendar
// "Mejores Acompañantes". No requiere simulación de combate, solo matemática
// de tipos + los movimientos/tipos que ya carga la app.
// ---------------------------------------------------------------------------
type PokeType = 'normal'|'fire'|'water'|'electric'|'grass'|'ice'|'fighting'|'poison'|'ground'|'flying'|'psychic'|'bug'|'rock'|'ghost'|'dragon'|'dark'|'steel'|'fairy'

const ALL_TYPES: PokeType[] = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy']

// Por cada tipo ATACANTE: contra qué tipos pega fuerte (2x) y contra cuáles pega débil (0.5x).
// Las "inmunidades" clásicas (ej. Normal no afecta a Fantasma) se tratan igual que
// una resistencia (0.5x), que es como realmente funcionan en Pokémon GO.
const TYPE_CHART: Record<PokeType, { strong: PokeType[], weak: PokeType[] }> = {
  normal:   { strong: [],                                   weak: ['rock','ghost','steel'] },
  fire:     { strong: ['grass','ice','bug','steel'],        weak: ['fire','water','rock','dragon'] },
  water:    { strong: ['fire','ground','rock'],              weak: ['water','grass','dragon'] },
  electric: { strong: ['water','flying'],                    weak: ['electric','grass','dragon','ground'] },
  grass:    { strong: ['water','ground','rock'],             weak: ['fire','grass','poison','flying','bug','dragon','steel'] },
  ice:      { strong: ['grass','ground','flying','dragon'],  weak: ['fire','water','ice','steel'] },
  fighting: { strong: ['normal','ice','rock','dark','steel'],weak: ['poison','flying','psychic','bug','fairy','ghost'] },
  poison:   { strong: ['grass','fairy'],                     weak: ['poison','ground','rock','ghost','steel'] },
  ground:   { strong: ['fire','electric','poison','rock','steel'], weak: ['grass','bug','flying'] },
  flying:   { strong: ['grass','fighting','bug'],            weak: ['electric','rock','steel'] },
  psychic:  { strong: ['fighting','poison'],                 weak: ['psychic','steel','dark'] },
  bug:      { strong: ['grass','psychic','dark'],            weak: ['fire','fighting','poison','flying','ghost','steel','fairy'] },
  rock:     { strong: ['fire','ice','flying','bug'],         weak: ['fighting','ground','steel'] },
  ghost:    { strong: ['psychic','ghost'],                   weak: ['dark','normal'] },
  dragon:   { strong: ['dragon'],                            weak: ['steel','fairy'] },
  dark:     { strong: ['psychic','ghost'],                   weak: ['fighting','dark','fairy'] },
  steel:    { strong: ['ice','rock','fairy'],                weak: ['fire','water','electric','steel'] },
  fairy:    { strong: ['fighting','dragon','dark'],           weak: ['fire','poison','steel'] },
}

function typeMultiplier(atk:PokeType, def:PokeType): number {
  const entry = TYPE_CHART[atk]
  if(!entry) return 1
  if(entry.strong.includes(def)) return 2
  if(entry.weak.includes(def)) return 0.5
  return 1
}
// Multiplicador total de un tipo atacante contra un Pokémon con 1 o 2 tipos (se multiplican)
function totalMultiplier(atk:PokeType, defTypes:string[]): number {
  return defTypes.reduce((acc, dt)=> acc * typeMultiplier(atk, dt.toLowerCase() as PokeType), 1)
}
function weaknessesOf(types:string[]): PokeType[] {
  return ALL_TYPES.filter(t=> totalMultiplier(t, types) > 1)
}
function resistancesOf(types:string[]): PokeType[] {
  return ALL_TYPES.filter(t=> totalMultiplier(t, types) < 1)
}
function baseSpeciesId(id:string): string {
  return id.endsWith('_shadow') ? id.slice(0, -7) : id
}

const TYPE_ES: Record<PokeType,string> = {
  normal:'Normal', fire:'Fuego', water:'Agua', grass:'Planta', electric:'Eléctrico',
  ice:'Hielo', fighting:'Lucha', poison:'Veneno', ground:'Tierra', flying:'Volador',
  psychic:'Psíquico', bug:'Bicho', rock:'Roca', ghost:'Fantasma', dragon:'Dragón',
  steel:'Acero', dark:'Siniestro', fairy:'Hada'
}
function translateTypeEs(t:string): string {
  return TYPE_ES[t.toLowerCase() as PokeType] || t
}
function translateTypesEs(types:string[]): string {
  return types.map(translateTypeEs).join('/')
}

type SectionKey = 'rankings' | 'mejorascaidas' | 'movimientos'
type MoveSortCol = 'name' | 'type' | 'energy' | 'power' | 'turns'
type MoveSortDir = 'asc' | 'desc'
type MoveSortState = { col: MoveSortCol, dir: MoveSortDir }
type FilterKey = 'mejoraron' | 'decayeron' | 'completo' | null

function normalize(str:string){ return str.toLowerCase().replace(/[^a-z0-9]/g,'') }
function formatName(str:string){
  if(!str) return str
  // reemplaza _ y formatea: sableye_shadow -> Sableye shadow -> Sableye Shadow
  let s = str.replace(/_/g,' ').replace(/\(/g,' (').trim()
  return s.split(' ').map(w=>{
    if(w.length===0) return w
    // maneja (shadow) -> (Shadow)
    if(w.startsWith('(')){
      return '(' + w.charAt(1).toUpperCase() + w.slice(2).toLowerCase()
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}
function capitalize(str:string){
  if(!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function useVisitCounter(){
  const [visitas, setVisitas] = useState<number|null>(null)
  const yaContado = useRef(false)
  useEffect(()=>{
    if (yaContado.current) return
    yaContado.current = true
    fetch('/api/visits')
      .then(r=> r.ok ? r.json() : Promise.reject())
      .then(data=> setVisitas(data.visitas))
      .catch(()=> setVisitas(null))
  }, [])
  return visitas
}

/**
 * Muestra la imagen de un Pokémon desde /images/{id}.webp (archivo individual,
 * en vez del viejo pokemon_images.json gigante). Carga diferida (loading="lazy")
 * para no pedir las 1199 imágenes de una — el navegador solo pide las que
 * realmente entran en pantalla. Si el archivo no existe (404), cae a un texto
 * de respaldo en vez de mostrar un ícono roto.
 */
function PokeImg({ id, name, placeholder, style }: { id:string, name:string, placeholder?: ReactNode, style?: CSSProperties }){
  const [error, setError] = useState(false)
  if(error){
    return <>{placeholder !== undefined ? placeholder : <span style={{fontSize:10, color:'var(--placeholder)'}}>imagen</span>}</>
  }
  return (
    <img
      src={`/images/${id}.webp`}
      alt={name}
      loading="lazy"
      style={style || {width:'100%', height:'100%', objectFit:'contain'}}
      onError={()=> setError(true)}
    />
  )
}

export default function App(){
  const visitas = useVisitCounter()
  const [theme, setTheme] = useState<ThemeKey>(()=>{
    try{
      const saved = window.localStorage.getItem('comparador_theme')
      if(saved==='light' || saved==='dark') return saved
    }catch{}
    return 'dark'
  })
  const [idioma, setIdioma] = useState<'es'|'en'>(()=>{
    try{
      const saved = window.localStorage.getItem('comparador_idioma')
      if(saved==='es' || saved==='en') return saved
    }catch{}
    return 'es'
  })
  useEffect(()=>{
    try{ window.localStorage.setItem('comparador_idioma', idioma) }catch{}
  },[idioma])

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme)
    try{ window.localStorage.setItem('comparador_theme', theme) }catch{}
  },[theme])

  const [liga, setLiga] = useState<LigaKey>('super')
  const [oldData, setOldData] = useState<PokemonEntry[]>([])
  const [newData, setNewData] = useState<PokemonEntry[]>([])
  const [movesEs, setMovesEs] = useState<Record<string,string>>({})
  const [movesFull, setMovesFull] = useState<Record<string,MoveFull>>({})
  const [movesActualizados, setMovesActualizados] = useState<MoveOverride[]>([])
  const [baseStatsMap, setBaseStatsMap] = useState<Record<string,{atk:number,def:number,hp:number}>>({})
  const [defaultIVsMap, setDefaultIVsMap] = useState<Record<string,{cp500?:number[],cp1500?:number[],cp2500?:number[]}>>({})
  const [formChangeMap, setFormChangeMap] = useState<Record<string, any>>({})
  const [originalFormIdMap, setOriginalFormIdMap] = useState<Record<string,string>>({})
  const [typesMap, setTypesMap] = useState<Record<string,string[]>>({})
  const [leagueLogos, setLeagueLogos] = useState<Record<string,string>>({})
  const [mejoraronSel, setMejoraronSel] = useState<string>('50')
  const [decayeronSel, setDecayeronSel] = useState<string>('')
  const [rankingCompletoSel, setRankingCompletoSel] = useState<string>('')
  const [ordenMejoraron, setOrdenMejoraron] = useState<'ranking'|'escalones'>('ranking')
  const [ordenDecayeron, setOrdenDecayeron] = useState<'ranking'|'escalones'>('ranking')
  const [activeTab, setActiveTab] = useState<'mejoraron'|'decayeron'|'completo'>('mejoraron')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Compared|null>(null)
  const [debug, setDebug] = useState<string>('')
  const [reloadKey, setReloadKey] = useState<number>(0)
  const [sinDatos, setSinDatos] = useState<boolean>(false)
  const headerTopRef = useRef<HTMLDivElement>(null)
  const [showVolver, setShowVolver] = useState(false)

  useEffect(()=>{
    function handleScroll(){
      const el = headerTopRef.current
      if(!el) return
      const bottom = el.getBoundingClientRect().bottom
      setShowVolver(bottom <= 0)
    }
    window.addEventListener('scroll', handleScroll, { passive:true })
    handleScroll()
    return ()=> window.removeEventListener('scroll', handleScroll)
  },[])

  // Sección activa (Rankings / Movimientos)
  const [section, setSection] = useState<SectionKey>('rankings')
  const [fastSort, setFastSort] = useState<MoveSortState>({ col:'name', dir:'asc' })
  const [chargedSort, setChargedSort] = useState<MoveSortState>({ col:'name', dir:'asc' })
  const [moveLearners, setMoveLearners] = useState<{ moveId:string, isFast:boolean } | null>(null)
  const [moveSearch, setMoveSearch] = useState('')
  const [movElige, setMovElige] = useState<'rapidos'|'cargados'>('rapidos')
  const [acompN, setAcompN] = useState<number>(5)
  const [mejorasCaidasTipo, setMejorasCaidasTipo] = useState<''|'mejoraron'|'decayeron'>('')

  useEffect(()=>{
    async function load(){
      try{
        const folder = LIGAS[liga].folder
        const [oldRes, newRes, movesRes, movesFullRes, movesActualizadosRes, typesRes, logosRes] = await Promise.all([
          fetch(`/data/${folder}/siempre_adelante.json`).catch(()=> null),
          fetch(`/data/${folder}/caminos_crepusculares.json`).catch(()=> null),
          fetch('/data/moves.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({})),
          fetch('/data/moves_full.json').then(r=> r.ok ? r.json() : []).catch(()=> []),
          fetch('/data/moves_actualizados.json').then(r=> r.ok ? r.json() : null).catch(()=> null),
          fetch('/data/pokemon_types.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({})),
          fetch('/data/logos/league_logos.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({}))
        ])
        const a = (oldRes && oldRes.ok) ? await oldRes.json() : []
        const b = (newRes && newRes.ok) ? await newRes.json() : []
        const fullMap: Record<string,MoveFull> = {}
        if(Array.isArray(movesFullRes)){
          movesFullRes.forEach((m:MoveFull)=> fullMap[m.moveId] = m)
        }
        // moves_actualizados.json puede venir como array plano, o como export
        // completo tipo "gamemaster" con los movimientos anidados en la clave "moves".
        let overrides: MoveOverride[] = []
        if(Array.isArray(movesActualizadosRes)){
          overrides = movesActualizadosRes
        } else if(movesActualizadosRes && Array.isArray(movesActualizadosRes.moves)){
          overrides = movesActualizadosRes.moves
        }
        // Ese mismo export "gamemaster" trae, por cada especie, sus stats base
        // reales (Ataque/Defensa/Salud) y el mejor IV que ya calculó PvPoke
        // ("Gana CMP") para cada tope de CP. Si el archivo no existe, quedan vacíos
        // y sencillamente no se muestran esos datos.
        const baseStats: Record<string,{atk:number,def:number,hp:number}> = {}
        const defaultIVs: Record<string,{cp500?:number[],cp1500?:number[],cp2500?:number[]}> = {}
        // pokemon_types.json no existe en el proyecto: se usa el gamemaster (moves_actualizados.json)
        // como fuente de tipos por especie, indexado por speciesName para no romper el resto del código.
        const typesFromGamemaster: Record<string,string[]> = {}
        // Mecánicas especiales de cambio de forma (Mimikyu, Cramorant, Morpeko, etc.)
        const formChanges: Record<string, any> = {}
        const originalFormIds: Record<string,string> = {}
        if(movesActualizadosRes && Array.isArray(movesActualizadosRes.pokemon)){
          movesActualizadosRes.pokemon.forEach((p:any)=>{
            if(p.speciesId && p.baseStats) baseStats[p.speciesId] = p.baseStats
            if(p.speciesId && p.defaultIVs) defaultIVs[p.speciesId] = p.defaultIVs
            if(p.speciesName && Array.isArray(p.types)){
              typesFromGamemaster[p.speciesName] = p.types.filter((t:string)=> t && t!=='none')
            }
            if(p.speciesId && p.formChange) formChanges[p.speciesId] = p.formChange
            if(p.speciesId && p.originalFormId) originalFormIds[p.speciesId] = p.originalFormId
          })
        }
        const mergedTypesMap = { ...typesFromGamemaster, ...(typesRes||{}) }
        setOldData(a); setNewData(b); setMovesEs(movesRes||{}); setMovesFull(fullMap); setMovesActualizados(overrides); setBaseStatsMap(baseStats); setDefaultIVsMap(defaultIVs); setTypesMap(mergedTypesMap); setLeagueLogos(logosRes||{}); setFormChangeMap(formChanges); setOriginalFormIdMap(originalFormIds)
        setSinDatos(a.length===0 && b.length===0)
        setDebug(`Cargados: ${LIGAS[liga].oldLabel} ${a.length} / ${LIGAS[liga].newLabel} ${b.length} / Moves ES ${Object.keys(movesRes||{}).length} / Full ${Object.keys(fullMap).length} / Actualizados ${overrides.length}`)
      }catch(e:any){ setDebug('Error: '+ e.message) }
    }
    load()
  },[reloadKey, liga])

  // Combina moves_full.json (base) con moves_actualizados.json (cambios de la
  // próxima temporada, Caminos Crepusculares). Solo se pisan los campos numéricos/
  // tipo que trae el archivo de overrides; el nombre en español (nameEs) se conserva del base.
  const movesFullActual = useMemo(()=>{
    if(!movesActualizados.length) return movesFull
    const merged: Record<string,MoveFull> = { ...movesFull }
    movesActualizados.forEach(ov=>{
      const base = merged[ov.moveId]
      merged[ov.moveId] = {
        moveId: ov.moveId,
        name: ov.name ?? base?.name ?? ov.moveId,
        nameEs: base?.nameEs ?? ov.name ?? ov.moveId,
        type: ov.type ?? base?.type ?? '',
        power: ov.power ?? base?.power ?? 0,
        energy: ov.energy ?? base?.energy ?? 0,
        energyGain: ov.energyGain ?? base?.energyGain ?? 0,
        isFast: base?.isFast ?? 0,
        cooldown: ov.cooldown ?? base?.cooldown ?? 0,
        turns: ov.turns ?? base?.turns ?? Math.round((ov.cooldown ?? base?.cooldown ?? 0)/500),
        buffs: ov.buffs,
        buffTarget: ov.buffTarget,
        buffApplyChance: ov.buffApplyChance!==undefined ? Number(ov.buffApplyChance) : undefined,
      }
    })
    return merged
  },[movesFull, movesActualizados])

  const translateMove = (moveId:string) => {
    if(!moveId) return moveId
    const clean = moveId.replace('*','')
    if(idioma==='en'){
      const full = movesFullActual[clean] || movesFullActual[moveId]
      return full?.name || clean.replace(/_/g,' ')
    }
    return movesEs[clean] || movesEs[moveId] || clean.replace(/_/g,' ')
  }
  // Envuelven las traducciones de tipo según el botón Español/English (arriba del todo).
  // Se declaran con el mismo nombre para no tener que tocar el resto de usos en el archivo.
  const translateType = (t:string): string => idioma==='en' ? capitalize(t) : translateTypeEs(t)
  const translateTypes = (types:string[]): string => types.map(translateType).join('/')
  const getMoveFull = (moveId:string): MoveFull | null => {
    const clean = moveId.replace('*','')
    // El modal de detalle siempre muestra el pokémon de la temporada "cur" (casi
    // siempre Caminos Crepusculares / temporada actual), por eso usa los stats actualizados.
    return movesFullActual[clean] || movesFullActual[moveId] || null
  }

  /** Describe en español el efecto secundario de un movimiento (subir/bajar Ataque o Defensa). */
  function formatMoveEffect(move: MoveFull | null): string | null {
    if(!move || !move.buffs) return null
    const [atkChange, defChange] = move.buffs
    if(!atkChange && !defChange) return null
    const chance = move.buffApplyChance!==undefined ? Math.round(move.buffApplyChance*1000)/10 : 100
    const quienAtk = move.buffTarget==='self' ? 'su propio' : 'el'
    const quienDef = move.buffTarget==='self' ? 'su propia' : 'la'
    const sujeto = move.buffTarget==='self' ? 'usuario' : 'rival'
    const partes: string[] = []
    if(atkChange) partes.push(`${atkChange>0?'sube':'baja'} ${Math.abs(atkChange)} nivel${Math.abs(atkChange)>1?'es':''} ${quienAtk} Ataque`)
    if(defChange) partes.push(`${defChange>0?'sube':'baja'} ${Math.abs(defChange)} nivel${Math.abs(defChange)>1?'es':''} ${quienDef} Defensa`)
    return `${chance}% de probabilidad de que ${partes.join(' y ')} (${sujeto})`
  }

  /**
   * Describe en español las mecánicas especiales de cambio de forma en combate
   * (Mimikyu, Cramorant, Morpeko y cualquier otro Pokémon con "formChange" en
   * el gamemaster). No requiere código específico por especie: se basa en el
   * patrón de la mecánica (protect / toggle / moveIDs), con detalle extra
   * conocido para Cramorant.
   */
  function describeFormChange(fc: any): string | null {
    if(!fc) return null
    if(fc.effect==='protect' && fc.trigger==='charged_move_damage'){
      return 'Disfraz (Manto): la primera vez que recibe daño de un movimiento cargado en el combate, lo bloquea por completo (0 de daño) y después queda con el disfraz roto el resto del combate.'
    }
    if(fc.type==='toggle'){
      return 'Modo Hambriento: cada vez que usa un movimiento cargado, cambia de forma (alterna entre sus 2 modos), lo que cambia el tipo de su movimiento según la forma activa en ese momento.'
    }
    if(Array.isArray(fc.moveIDs) && fc.moveIDs.length){
      const nombres = fc.moveIDs.map((id:string)=> translateMove(id)).join(' o ')
      return `Gulp Missile: al usar ${nombres}, cambia de forma temporalmente y dispara gratis (sin gastar energía) un ataque extra en el siguiente turno; luego vuelve a su forma normal.`
    }
    if(fc.type==='set' && fc.alternativeFormId){
      return `Puede cambiar de forma en combate según ciertas condiciones (forma alternativa: ${fc.alternativeFormId}).`
    }
    return null
  }

  const newRankMap = useMemo(()=>{
    const m = new Map<string, number>()
    newData.forEach((p,i)=>{ m.set(p.speciesId, (p as any).rank ?? i+1); m.set(normalize(p.speciesName), (p as any).rank ?? i+1) })
    return m
  },[newData])

  const compared: Compared[] = useMemo(()=>{
    if(!oldData.length || !newData.length) return []
    const oldMap = new Map<string, {entry:PokemonEntry, rank:number}>()
    oldData.forEach((p,i)=> { oldMap.set(p.speciesId, {entry:p, rank: (p as any).rank_old ?? i+1}); oldMap.set(normalize(p.speciesName), {entry:p, rank: (p as any).rank_old ?? i+1}) })
    const newMap = new Map<string, {entry:PokemonEntry, rank:number}>()
    newData.forEach((p,i)=> { newMap.set(p.speciesId, {entry:p, rank: (p as any).rank ?? i+1}); newMap.set(normalize(p.speciesName), {entry:p, rank: (p as any).rank ?? i+1}) })
    const list: Compared[] = []; const seen = new Set<string>()
    oldMap.forEach((v)=>{
      const id = v.entry.speciesId; if(seen.has(id)) return
      const n = newMap.get(id) || newMap.get(normalize(v.entry.speciesName)); if(!n) return
      seen.add(id)
      list.push({ id, name: v.entry.speciesName, oldRank: v.rank, newRank: n.rank, delta: n.rank - v.rank, mejora: v.rank - n.rank, old: v.entry, cur: n.entry, tipos: typesMap[v.entry.speciesName]||[] })
    })
    return list
  },[oldData,newData, typesMap])

  const mejoraronList = useMemo(()=>{
    const f = compared.filter(c=> c.mejora>0)
    return f.sort((a,b)=> ordenMejoraron==='escalones' ? (b.mejora - a.mejora) : (a.newRank - b.newRank))
  },[compared, ordenMejoraron])
  const decayeronList = useMemo(()=>{
    const f = compared.filter(c=> c.delta>0)
    return f.sort((a,b)=> ordenDecayeron==='escalones' ? (b.delta - a.delta) : (a.newRank - b.newRank))
  },[compared, ordenDecayeron])
  const completoCaminos = useMemo(()=>{ const f = [...newData]; return f.map((p,i)=> ({...p, rankActual: (p as any).rank ?? i+1})).sort((a,b)=> a.rankActual - b.rankActual) },[newData])
  const completoSiempre = useMemo(()=>{ const f = [...oldData]; return f.map((p,i)=> ({...p, rankActual: (p as any).rank_old ?? i+1})).sort((a,b)=> a.rankActual - b.rankActual) },[oldData])

  // Mapa id -> Compared, para reutilizar el mismo modal de detalle desde cualquier lista
  const comparedById = useMemo(()=>{
    const m = new Map<string, Compared>()
    compared.forEach(c=> m.set(c.id, c))
    return m
  },[compared])

  // Construye un objeto "Compared" a partir de cualquier entrada (aunque no tenga contraparte en la otra temporada)
  function buildCompared(entry:PokemonEntry, rankActual:number): Compared {
    const existing = comparedById.get(entry.speciesId)
    if(existing) return existing
    return {
      id: entry.speciesId,
      name: entry.speciesName,
      oldRank: rankActual,
      newRank: rankActual,
      delta: 0,
      mejora: 0,
      old: entry,
      cur: entry,
      tipos: typesMap[entry.speciesName] || []
    }
  }

  // Universo completo para la búsqueda global (compared + huérfanos de cada temporada)
  const universoBusqueda = useMemo(()=>{
    const list: Compared[] = [...compared]
    const seen = new Set(compared.map(c=> c.id))
    oldData.forEach((p,i)=>{
      if(!seen.has(p.speciesId)){
        seen.add(p.speciesId)
        list.push(buildCompared(p, (p as any).rank_old ?? i+1))
      }
    })
    newData.forEach((p,i)=>{
      if(!seen.has(p.speciesId)){
        seen.add(p.speciesId)
        list.push(buildCompared(p, (p as any).rank ?? i+1))
      }
    })
    return list
  },[compared, oldData, newData, typesMap])

  // Resultados de búsqueda: siempre sobre TODO el dataset, sin importar filtros/tab activo
  const searchResults = useMemo(()=>{
    if(!search.trim()) return null
    const q = search.toLowerCase()
    return universoBusqueda.filter(c=> c.name.toLowerCase().includes(q)).sort((a,b)=> a.newRank - b.newRank)
  },[search, universoBusqueda])

  // Calcula los 2 IV recomendados (Mejor IV / Mejor IV Gana CMP) para cualquier
  // speciesId. Reutilizable tanto en las tarjetas de la lista como en el modal
  // de detalle. Devuelve null si la especie no vino en moves_actualizados.json.
  function computeStatsYIV(speciesId:string){
    const base = baseStatsMap[speciesId]
    if(!base) return null
    const cpCap = CP_CAPS[liga]
    const mejorIV = findBestIV(base.atk, base.def, base.hp, cpCap)
    let ganaCMP: { level:number, atk:number, def:number, hp:number, statAtk:number, statDef:number, statHp:number } | null = null
    if(liga==='master'){
      const s = statsAtLevel(base.atk, base.def, base.hp, 15,15,15, 51)
      ganaCMP = { level:51, atk:15, def:15, hp:15, statAtk:s.atk, statDef:s.def, statHp:s.hp }
    } else {
      const key = liga==='super' ? 'cp1500' : 'cp2500'
      const arr = defaultIVsMap[speciesId]?.[key as 'cp1500'|'cp2500']
      if(arr && arr.length===4){
        const s = statsAtLevel(base.atk, base.def, base.hp, arr[1], arr[2], arr[3], arr[0])
        ganaCMP = { level:arr[0], atk:arr[1], def:arr[2], hp:arr[3], statAtk:s.atk, statDef:s.def, statHp:s.hp }
      }
    }
    return { base, mejorIV, ganaCMP }
  }

  /** Resumen compacto de los 2 IV recomendados, para mostrar dentro de cada tarjeta. */
  function IVBadgesTarjeta({ speciesId }: { speciesId:string }){
    const iv = computeStatsYIV(speciesId)
    if(!iv) return null
    return (
      <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:6}}>
        <span className="chip" style={{fontSize:11}}>Mejor IV: {iv.mejorIV.atk}/{iv.mejorIV.def}/{iv.mejorIV.hp} (Nv {iv.mejorIV.level})</span>
        {iv.ganaCMP && (
          <span className="chip" style={{fontSize:11}}>Gana CMP: {iv.ganaCMP.atk}/{iv.ganaCMP.def}/{iv.ganaCMP.hp} (Nv {iv.ganaCMP.level})</span>
        )}
      </div>
    )
  }

  // Stats base + los 2 IV recomendados (Mejor IV / Mejor IV Gana CMP) del Pokémon
  // que está abierto en el modal de detalle. Se recalcula solo cuando cambia el
  // seleccionado o la liga, no en cada render.
  const statsYIV = useMemo(()=>{
    if(!selected) return null
    return computeStatsYIV(selected.id)
  },[selected, baseStatsMap, defaultIVsMap, liga])

  // Mejores Acompañantes: no usa simulación de combate, usa afinidad de tipos +
  // movimientos + rol (hexágono), igual a como un jugador arma equipo mentalmente.
  // Reglas:
  // 1) Se descarta de plano cualquier candidato que comparta AL MENOS UNA de las
  //    debilidades de tipo del seleccionado (redundancia defensiva = mal acompañante),
  //    sin importar qué otra cosa tenga a favor.
  // 2) El resto del pool se limita al Top 100 del ranking de la liga activa (relevancia meta).
  // 3) De los que pasan el filtro, se necesita AL MENOS una razón positiva para aparecer.
  // 4) Orden final: por su propia posición en el ranking (mejor rank primero), no por puntaje.
  const acompanantes = useMemo(()=>{
    if(!selected) return []
    const tiposSel = selected.tipos.length ? selected.tipos : (typesMap[selected.name]||[])
    if(!tiposSel.length) return []
    const debilidadesSel = weaknessesOf(tiposSel)
    const baseSel = baseSpeciesId(selected.id)

    const resultado: { compared:Compared, reasons:string[] }[] = []

    universoBusqueda.forEach(c=>{
      if(baseSpeciesId(c.id)===baseSel) return // no recomendarse a sí mismo ni a sus otras formas
      if(c.newRank>100) return // solo relevancia meta (Top 100 de la liga activa)

      const tiposC = c.tipos.length ? c.tipos : (typesMap[c.name]||[])
      if(!tiposC.length) return

      // Filtro duro: si el candidato comparte alguna debilidad con el seleccionado, se descarta entero
      const debilidadesC = weaknessesOf(tiposC)
      const comparteDebilidad = debilidadesSel.some(t=> debilidadesC.includes(t))
      if(comparteDebilidad) return

      const reasons: string[] = []

      if(debilidadesSel.length){
        const resistidos: string[] = []
        const neutros: string[] = []
        debilidadesSel.forEach(t=>{
          const mult = totalMultiplier(t, tiposC)
          if(mult<1) resistidos.push(translateType(t))
          else neutros.push(translateType(t)) // ya no puede ser >1 (se filtró arriba), así que es neutro
        })
        if(resistidos.length) reasons.push(`Resiste a ${resistidos.join(', ')}`)
        if(neutros.length) reasons.push(`Neutro contra ${neutros.join(', ')}`)

        // Movimientos (rápido o cargado) que pegan SÚPER EFECTIVO contra los tipos que
        // amenazan al seleccionado (ej. un movimiento Bicho contra la debilidad a Planta).
        const movesC = [...(c.cur.moves?.fastMoves||[]), ...(c.cur.moves?.chargedMoves||[])]
        const tiposCubiertos = new Set<string>()
        debilidadesSel.forEach(t=>{
          const tieneMoveFuerte = movesC.some(mm=>{
            const mf = movesFullActual[mm.moveId.replace('*','')]
            return mf && totalMultiplier(mf.type as PokeType, [t]) > 1
          })
          if(tieneMoveFuerte) tiposCubiertos.add(translateType(t))
        })
        if(tiposCubiertos.size) reasons.push(`Movimientos fuertes contra ${[...tiposCubiertos].join(', ')}`)
      }

      // Cambio seguro: pocas debilidades propias, sin relación directa al seleccionado
      if(debilidadesC.length<=2) reasons.push('Cambio seguro (Safe Switch)')

      // Resistencia general (muchas resistencias de tipo)
      const resistenciasC = resistancesOf(tiposC)
      if(resistenciasC.length>=8) reasons.push('Gran resistencia')
      else if(resistenciasC.length>=6) reasons.push('Buena resistencia')

      // Gran Cerrador (score de Closer alto, ya viene calculado en el ranking)
      const closerScore = c.cur.scores?.[1] || 0
      if(closerScore>=90) reasons.push('Gran Cerrador')

      if(reasons.length) resultado.push({ compared:c, reasons })
    })

    return resultado.sort((a,b)=> a.compared.newRank - b.compared.newRank)
  },[selected, universoBusqueda, typesMap, movesFullActual])

  const filteredMejoraron = useMemo(()=>{ const count = mejoraronSel === 'TODOS' ? mejoraronList.length : parseInt(mejoraronSel); return mejoraronList.slice(0, count) },[mejoraronList, mejoraronSel])
  const filteredDecayeron = useMemo(()=>{ if(!decayeronSel) return []; const count = decayeronSel === 'TODOS' ? decayeronList.length : parseInt(decayeronSel); return decayeronList.slice(0, count) },[decayeronList, decayeronSel])

  const handleMejoraronChange = (val:string)=>{
    if(val===mejoraronSel){
      // 1. Debe limpiarse y recargar aunque sea la misma opción
      setReloadKey(k=>k+1); setSearch(''); setActiveTab('mejoraron'); return
    }
    setMejoraronSel(val); setActiveTab('mejoraron'); setDecayeronSel(''); setRankingCompletoSel('')
  }
  const handleDecayeronChange = (val:string)=>{
    if(val===decayeronSel && val!==''){ setReloadKey(k=>k+1); setSearch(''); return }
    setDecayeronSel(val); if(val) { setActiveTab('decayeron'); setRankingCompletoSel('') }
  }
  const handleCompletoChange = (val:string)=>{
    if(val===rankingCompletoSel && val!==''){ setReloadKey(k=>k+1); setSearch(''); return }
    setRankingCompletoSel(val); if(val) { setActiveTab('completo'); setMejoraronSel('50'); setDecayeronSel('') }
  }

  // Cambia de liga (Super / Ultra / Master) reseteando filtros y selección
  const handleLigaChange = (l:LigaKey) => {
    if(l===liga) return
    setLiga(l)
    setSection('rankings')
    setSearch('')
    setSelected(null)
    setMoveLearners(null)
    setMejoraronSel('50')
    setDecayeronSel('')
    setRankingCompletoSel('')
    setActiveTab('mejoraron')
    setMejorasCaidasTipo('')
  }

  const displayList = activeTab==='mejoraron' ? filteredMejoraron : activeTab==='decayeron' ? filteredDecayeron : []

  const getRankingForOpponent = (opId:string): number | null => {
    return newRankMap.get(opId) || newRankMap.get(normalize(opId)) || null
  }

  // Filtro actualmente "activo" para dibujar el recuadro ovalado que lo conecta con su resultado
  const activeFilterKey: FilterKey = search.trim() ? null : activeTab

  // ---------- Sección Movimientos ----------
  // Un movimiento es Cargado si no genera energía (energyGain === 0); Rápido si sí genera (energyGain > 0).
  // No usamos el campo "isFast" del JSON porque viene incorrecto para algunos movimientos (ej. Bocajarro).
  // Solo se muestran los movimientos de la temporada actual (Caminos Crepusculares), ya actualizados.
  const allMoves = useMemo(()=> Object.values(movesFullActual), [movesFullActual])
  const fastMovesList = useMemo(()=> allMoves.filter(m=> (m.energyGain||0) > 0), [allMoves])
  const chargedMovesList = useMemo(()=> allMoves.filter(m=> (m.energyGain||0) === 0), [allMoves])

  function sortMoves(list: MoveFull[], sort: MoveSortState): MoveFull[]{
    const dir = sort.dir==='asc' ? 1 : -1
    const arr = [...list]
    arr.sort((a,b)=>{
      let av:any, bv:any
      switch(sort.col){
        case 'name': av=(a.nameEs||a.name||'').toLowerCase(); bv=(b.nameEs||b.name||'').toLowerCase(); break
        case 'type': av=(a.type||'').toLowerCase(); bv=(b.type||'').toLowerCase(); break
        case 'energy': av = (a.energyGain||0) > 0 ? (a.energyGain||0) : (a.energy||0); bv = (b.energyGain||0) > 0 ? (b.energyGain||0) : (b.energy||0); break
        case 'power': av=a.power||0; bv=b.power||0; break
        case 'turns': av=(a.turns ?? Math.round((a.cooldown||0)/500)); bv=(b.turns ?? Math.round((b.cooldown||0)/500)); break
      }
      if(av<bv) return -1*dir
      if(av>bv) return 1*dir
      return (a.nameEs||a.name||'').localeCompare(b.nameEs||b.name||'')
    })
    return arr
  }

  const fastMovesSorted = useMemo(()=> sortMoves(fastMovesList, fastSort), [fastMovesList, fastSort])
  const chargedMovesSorted = useMemo(()=> sortMoves(chargedMovesList, chargedSort), [chargedMovesList, chargedSort])

  // Filtro de texto para la sección Movimientos (busca en nombre ES e ingles)
  function filterMovesBySearch(list: MoveFull[]): MoveFull[]{
    const q = moveSearch.trim().toLowerCase()
    if(!q) return list
    return list.filter(m=> (m.nameEs||'').toLowerCase().includes(q) || (m.name||'').toLowerCase().includes(q))
  }
  const fastMovesFiltered = useMemo(()=> filterMovesBySearch(fastMovesSorted), [fastMovesSorted, moveSearch])
  const chargedMovesFiltered = useMemo(()=> filterMovesBySearch(chargedMovesSorted), [chargedMovesSorted, moveSearch])

  function toggleSort(which:'fast'|'charged', col:MoveSortCol){
    if(which==='fast'){
      setFastSort(s=> s.col===col ? { col, dir: s.dir==='asc'?'desc':'asc' } : { col, dir:'asc' })
    } else {
      setChargedSort(s=> s.col===col ? { col, dir: s.dir==='asc'?'desc':'asc' } : { col, dir:'asc' })
    }
  }
  function sortArrow(which:'fast'|'charged', col:MoveSortCol){
    const s = which==='fast' ? fastSort : chargedSort
    if(s.col!==col) return ''
    return s.dir==='asc' ? ' ▲' : ' ▼'
  }

  // Pokémon que aprenden el movimiento seleccionado. Se prioriza la temporada
  // ACTUAL (newData/Caminos Crepusculares) porque un Pokémon puede ganar un
  // movimiento nuevo esa temporada (ej. Volbeat aprende Acoso recién en la
  // próxima); antes se priorizaba por error la temporada anterior y esos casos
  // no aparecían. Solo se usa la temporada anterior como respaldo si la especie
  // no existe en absoluto en la temporada actual.
  const learnersFor = useMemo(()=>{
    if(!moveLearners) return []
    const { moveId } = moveLearners
    const map = new Map<string, PokemonEntry>()
    ;[...newData, ...oldData].forEach(p=>{ if(!map.has(p.speciesId)) map.set(p.speciesId, p) })
    const result: PokemonEntry[] = []
    map.forEach(p=>{
      const fastIds = (p.moves?.fastMoves||[]).map(m=> m.moveId)
      const chargedIds = (p.moves?.chargedMoves||[]).map(m=> m.moveId)
      if(fastIds.includes(moveId) || chargedIds.includes(moveId)) result.push(p)
    })
    return result.sort((a,b)=> a.speciesName.localeCompare(b.speciesName))
  },[moveLearners, oldData, newData])

  return (
    <div>
      <div className="header" ref={headerTopRef}>
        <div className="container">
          {visitas!==null && (
            <div style={{textAlign:'center', fontSize:12, color:'var(--muted)', marginBottom:6}}>
              👁️ Visitas: {visitas.toLocaleString('es-PE')}
            </div>
          )}
          <h1 className="main-title" style={{textAlign:'center'}}>SELECCIONA TU LIGA A ANALIZAR:</h1>

          <div style={{display:'flex', justifyContent:'center', marginTop:16}}>
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
              {leagueLogos[liga] && <img src={leagueLogos[liga]} alt="" width={40} height={40} />}
              <select
                className="liga-combo"
                value={liga}
                onChange={e=> handleLigaChange(e.target.value as LigaKey)}
              >
                {(Object.keys(LIGAS) as LigaKey[]).map(key=>(
                  <option key={key} value={key}>{LIGAS[key].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{display:'flex', justifyContent:'center', gap:10, marginTop:14, flexWrap:'wrap'}}>
            <button className="theme-toggle-btn" onClick={()=> setTheme(t=> t==='dark' ? 'light' : 'dark')}>
              {theme==='dark' ? '☀️ Fondo claro' : '🌙 Fondo oscuro'}
            </button>
            <button className="theme-toggle-btn" onClick={()=> setIdioma(i=> i==='es' ? 'en' : 'es')}>
              {idioma==='es' ? '🇬🇧 English' : '🇪🇸 Español'}
            </button>
          </div>

          <p className="welcome-banner" style={{marginTop:28, textAlign:'center'}}>
            Como señal de apoyo, suscríbete gratis a mi canal de YouTube:{' '}
            <a href="https://www.youtube.com/@EntrenadorGuayD" target="_blank" rel="noopener noreferrer">Entrenador GuayD</a>
            {' '}(si das clic te lleva directo a mi canal de YouTube), muchas gracias.
          </p>
        </div>
      </div>

      <div className="sticky-section-nav">
        <div className="container">
          <div className="section-nav" style={{justifyContent:'center', margin:0}}>
            <button className={`section-btn ${section==='rankings' ? 'active' : ''}`} onClick={()=> setSection('rankings')}>📊 Rankings</button>
            <button className={`section-btn ${section==='mejorascaidas' ? 'active' : ''}`} onClick={()=> setSection('mejorascaidas')}>🔀 Mejoras / Caídas</button>
            <button className={`section-btn ${section==='movimientos' ? 'active' : ''}`} onClick={()=> setSection('movimientos')}>⚔️ Movimientos</button>
          </div>
        </div>
      </div>

      {showVolver && (
        <button
          className="volver-btn"
          onClick={()=> window.scrollTo({ top:0, behavior:'smooth' })}
          aria-label="Volver arriba"
          title="Volver arriba"
        >⬆</button>
      )}

      <div className="container" style={{display:'flex',flexDirection:'column',gap:12, marginTop:12}}>

        {sinDatos && (
          <div className="notice">
            Aún no hay datos cargados para {LIGAS[liga].label}. Agrega los archivos <code>siempre_adelante.json</code> y <code>caminos_crepusculares.json</code> en <code>public/data/{LIGAS[liga].folder}/</code> para habilitar esta liga.
          </div>
        )}

        {section==='rankings' && (
          <>
            {!sinDatos && (
              <div className="small" style={{textAlign:'center', lineHeight:1.6}}>
                Ranking completo de la temporada actual ({LIGAS[liga].newLabel}) para {LIGAS[liga].label}.
                <br/>
                Usa el buscador para encontrar un Pokémon puntual.
              </div>
            )}

            <div className={`filter-frame ${search.trim() ? 'filter-frame-active' : ''}`}>
              <input className="search search-highlight" placeholder="🔎 Buscar Pokémon... ej: Azumarill, Quagsire, Tinkaton" value={search} onChange={e=> setSearch(e.target.value)} />
            </div>

            <div className="filter-frame">
              {searchResults!==null ? (
                <>
                  {searchResults.length===0 ? (
                    <div className="notice">
                      No se encontró ningún Pokémon para "{search}" en {LIGAS[liga].label}. Si es un legendario/mítico, puede que no sea elegible por CP para esta liga (no puede bajar de su tope de CP) — prueba buscarlo en Liga Master.
                    </div>
                  ) : (
                    <div className="small">{searchResults.length} resultado(s) para "{search}"</div>
                  )}
                  <div className="grid" style={{marginTop:10}}>
                    {searchResults.map(c=>(
                      <div key={c.id} className="card" onClick={()=> setSelected(c)} style={{cursor:'pointer', display:'flex', gap:10}}>
                        <div style={{width:64, height:64, background:'var(--card2)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid var(--border)', overflow:'hidden'}}>
                          <PokeImg id={c.id} name={c.name} />
                        </div>
                        <div style={{flex:1}}>
                          <div className="row">
                            <div style={{display:'flex', flexDirection:'column'}}>
                              <div className="rank" style={{fontSize:20}}>#{c.newRank} {formatName(c.name)} <span style={{fontWeight:400, fontSize:13, color:'var(--muted)'}}>{c.tipos.length? `(${translateTypes(c.tipos)})`:''}</span></div>
                            </div>
                          </div>
                          <div className="moves" style={{marginTop:8}}>
                            <div><b>Rápido:</b> {translateMove(c.cur.moveset?.[0]||'')}</div>
                            <div><b>Cargados:</b> {(c.cur.moveset?.slice(1)||[]).map(m=> translateMove(m)).join(', ')}</div>
                          </div>
                          <IVBadgesTarjeta speciesId={c.id} />
                          <button className="btn" style={{marginTop:8}} onClick={(e)=>{ e.stopPropagation(); setSelected(c) }}>Ver información Completa</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="small">Mostrando {LIGAS[liga].newLabel} - {completoCaminos.length} Pokémon</div>
                  <div className="grid" style={{marginTop:10}}>
                    {completoCaminos.map((p:any)=>(
                      <div key={p.speciesId} className="card" style={{display:'flex', gap:10, alignItems:'center'}}>
                        <div style={{width:56, height:56, background:'var(--card2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid var(--border)', flexShrink:0}}>
                          <PokeImg id={p.speciesId} name={p.speciesName} />
                        </div>
                        <div style={{flex:1}}>
                          <div className="rank" style={{fontSize:18}}>#{p.rankActual} {formatName(p.speciesName)}</div>
                          <div className="moves" style={{marginTop:4}}><b>Rápido:</b> {translateMove(p.moveset?.[0])} <br/><b>Cargados:</b> {p.moveset?.slice(1).map((m:string)=> translateMove(m)).join(', ')}</div>
                          <IVBadgesTarjeta speciesId={p.speciesId} />
                        </div>
                        <button className="btn" style={{flexShrink:0, whiteSpace:'nowrap'}} onClick={()=> setSelected(buildCompared(p, p.rankActual))}>Ver información Completa</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {section==='mejorascaidas' && (
          <>
            <div className="filter-frame filter-frame-active">
              <label className="filter-label-big">🔀 ¿Qué quieres ver?</label>
              <select
                className="search"
                value={mejorasCaidasTipo}
                onChange={e=> setMejorasCaidasTipo(e.target.value as ''|'mejoraron'|'decayeron')}
              >
                <option value="">-- Selecciona: Pokémon que mejoraron o Pokémon que decayeron --</option>
                <option value="mejoraron">🚀 Pokémon que mejoraron</option>
                <option value="decayeron">📉 Pokémon que decayeron</option>
              </select>
            </div>

            {mejorasCaidasTipo==='mejoraron' && (
              <div className="filter-frame filter-frame-active" style={{display:'flex', flexDirection:'column', gap:10}}>
                <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                  <div style={{flex:1, minWidth:200}}>
                    <label className="small" style={{display:'block', marginBottom:4}}>Cuántos mostrar</label>
                    <select className="search" value={mejoraronSel} onChange={e=> handleMejoraronChange(e.target.value)}>
                      <option value="10">Top 10 Mejoraron</option>
                      <option value="30">Top 30 Mejoraron</option>
                      <option value="50">Top 50 Mejoraron</option>
                      <option value="100">Top 100 Mejoraron</option>
                      <option value="200">Top 200 Mejoraron</option>
                      <option value="TODOS">TODOS los que mejoraron</option>
                    </select>
                  </div>
                  <div style={{flex:1, minWidth:200}}>
                    <label className="small" style={{display:'block', marginBottom:4}}>Ordenar por</label>
                    <select className="search" value={ordenMejoraron} onChange={e=> setOrdenMejoraron(e.target.value as 'ranking'|'escalones')}>
                      <option value="ranking">N° en Ranking</option>
                      <option value="escalones">N° de Escalones</option>
                    </select>
                  </div>
                </div>
                <div className="small">{filteredMejoraron.length} resultados • Top {mejoraronSel} que mejoraron ({ordenMejoraron==='escalones' ? 'orden por escalones' : 'orden por ranking'})</div>
                <div className="grid">
                  {filteredMejoraron.map(c=>(
                    <div key={c.id} className="card" onClick={()=> setSelected(c)} style={{cursor:'pointer', display:'flex', gap:10}}>
                      <div style={{width:64, height:64, background:'var(--card2)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid var(--border)', overflow:'hidden'}}>
                        <PokeImg id={c.id} name={c.name} />
                      </div>
                      <div style={{flex:1}}>
                        <div className="row">
                          <div style={{display:'flex', flexDirection:'column'}}>
                            <div className="rank" style={{fontSize:20}}>#{c.newRank} {formatName(c.name)} <span style={{fontWeight:400, fontSize:13, color:'var(--muted)'}}>{c.tipos.length? `(${translateTypes(c.tipos)})`:''}</span></div>
                            <div style={{display:'flex', gap:12, marginTop:4}}>
                              <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Antes <b style={{color:'var(--text)', fontSize:14}}>#{c.oldRank}</b></span>
                              <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Ahora <b style={{color:'var(--blue)', fontSize:14}}>#{c.newRank}</b></span>
                            </div>
                          </div>
                          <span className="badge" style={{fontSize:12, padding:'4px 8px', background:'var(--green-bg)', color:'var(--green-text)', display:'flex', gap:4, alignItems:'center'}}>escaló: ▲ +{c.mejora}</span>
                        </div>
                        <div className="moves" style={{marginTop:8}}>
                          <div><b>Rápido:</b> {translateMove(c.cur.moveset?.[0]||'')}</div>
                          <div><b>Cargados:</b> {(c.cur.moveset?.slice(1)||[]).map(m=> translateMove(m)).join(', ')}</div>
                        </div>
                        <IVBadgesTarjeta speciesId={c.id} />
                        <button className="btn" style={{marginTop:8}} onClick={(e)=>{ e.stopPropagation(); setSelected(c) }}>Ver información Completa</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mejorasCaidasTipo==='decayeron' && (
              <div className="filter-frame filter-frame-active" style={{display:'flex', flexDirection:'column', gap:10}}>
                <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                  <div style={{flex:1, minWidth:200}}>
                    <label className="small" style={{display:'block', marginBottom:4}}>Cuántos mostrar</label>
                    <select className="search" value={decayeronSel || '50'} onChange={e=> handleDecayeronChange(e.target.value)}>
                      <option value="10">Top 10 Decayeron</option>
                      <option value="20">Top 20 Decayeron</option>
                      <option value="30">Top 30 Decayeron</option>
                      <option value="50">Top 50 Decayeron</option>
                      <option value="200">Top 200 Decayeron</option>
                      <option value="TODOS">TODOS los que decayeron</option>
                    </select>
                  </div>
                  <div style={{flex:1, minWidth:200}}>
                    <label className="small" style={{display:'block', marginBottom:4}}>Ordenar por</label>
                    <select className="search" value={ordenDecayeron} onChange={e=> setOrdenDecayeron(e.target.value as 'ranking'|'escalones')}>
                      <option value="ranking">N° en Ranking</option>
                      <option value="escalones">N° de Escalones</option>
                    </select>
                  </div>
                </div>
                <div className="small">{filteredDecayeron.length} resultados • Top {decayeronSel || '50'} que decayeron ({ordenDecayeron==='escalones' ? 'orden por escalones' : 'orden por ranking'})</div>
                <div className="grid">
                  {filteredDecayeron.map(c=>(
                    <div key={c.id} className="card" onClick={()=> setSelected(c)} style={{cursor:'pointer', display:'flex', gap:10}}>
                      <div style={{width:64, height:64, background:'var(--card2)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid var(--border)', overflow:'hidden'}}>
                        <PokeImg id={c.id} name={c.name} />
                      </div>
                      <div style={{flex:1}}>
                        <div className="row">
                          <div style={{display:'flex', flexDirection:'column'}}>
                            <div className="rank" style={{fontSize:20}}>#{c.newRank} {formatName(c.name)} <span style={{fontWeight:400, fontSize:13, color:'var(--muted)'}}>{c.tipos.length? `(${translateTypes(c.tipos)})`:''}</span></div>
                            <div style={{display:'flex', gap:12, marginTop:4}}>
                              <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Antes <b style={{color:'var(--text)', fontSize:14}}>#{c.oldRank}</b></span>
                              <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Ahora <b style={{color:'var(--blue)', fontSize:14}}>#{c.newRank}</b></span>
                            </div>
                          </div>
                          <span className="badge" style={{fontSize:12, padding:'4px 8px', background:'var(--red-bg)', color:'var(--red-text)', display:'flex', gap:4, alignItems:'center'}}>cayó: ▼ {c.delta}</span>
                        </div>
                        <div className="moves" style={{marginTop:8}}>
                          <div><b>Rápido:</b> {translateMove(c.cur.moveset?.[0]||'')}</div>
                          <div><b>Cargados:</b> {(c.cur.moveset?.slice(1)||[]).map(m=> translateMove(m)).join(', ')}</div>
                        </div>
                        <IVBadgesTarjeta speciesId={c.id} />
                        <button className="btn" style={{marginTop:8}} onClick={(e)=>{ e.stopPropagation(); setSelected(c) }}>Ver información Completa</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {section==='movimientos' && (
          <div style={{display:'flex', flexDirection:'column', gap:16}}>
            <input
              className="search"
              placeholder="Buscar movimiento... ej: Bola Sombra, Acua Cola, Dragon Breath"
              value={moveSearch}
              onChange={e=> setMoveSearch(e.target.value)}
            />

            <div className="filter-frame filter-frame-active">
              <label className="filter-label-big">Elige:</label>
              <select className="search" value={movElige} onChange={e=> setMovElige(e.target.value as 'rapidos'|'cargados')}>
                <option value="rapidos">⚡ Mov. Rápidos</option>
                <option value="cargados">💥 Mov. Cargados</option>
              </select>
            </div>

            <div className="small" style={{color:'var(--muted)'}}>
              <b>Leyenda:</b> T: Tipo • E: Energía que genera{movElige==='cargados' ? ' (o requiere)' : ''} • D: Daño{movElige==='rapidos' ? ' • T: Turnos' : ''} • EF: Efecto
            </div>

            {movElige==='rapidos' && (
              <div className="moves-table-wrap">
                <table className="moves-table">
                  <thead>
                    <tr>
                      <th onClick={()=> toggleSort('fast','name')}>Nombre{sortArrow('fast','name')}</th>
                      <th onClick={()=> toggleSort('fast','type')}>T{sortArrow('fast','type')}</th>
                      <th onClick={()=> toggleSort('fast','energy')}>E{sortArrow('fast','energy')}</th>
                      <th onClick={()=> toggleSort('fast','power')}>D{sortArrow('fast','power')}</th>
                      <th onClick={()=> toggleSort('fast','turns')}>T{sortArrow('fast','turns')}</th>
                      <th>EF</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fastMovesFiltered.map((m,i)=>(
                      <tr key={m.moveId}>
                        <td>{i+1}. {m.nameEs || m.name} <span className="move-en">({m.name})</span></td>
                        <td>{translateType(m.type)}</td>
                        <td>{m.energyGain}</td>
                        <td>{m.power}</td>
                        <td>{m.turns ?? Math.round((m.cooldown||0)/500)}</td>
                        <td className="small">{formatMoveEffect(m) || '—'}</td>
                        <td><button className="btn" onClick={()=> setMoveLearners({ moveId:m.moveId, isFast:true })}>Ver Pokémon</button></td>
                      </tr>
                    ))}
                    {fastMovesFiltered.length===0 && (
                      <tr><td colSpan={7} className="small" style={{textAlign:'center', padding:16}}>Sin resultados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {movElige==='cargados' && (
              <div className="moves-table-wrap">
                <table className="moves-table">
                  <thead>
                    <tr>
                      <th onClick={()=> toggleSort('charged','name')}>Nombre{sortArrow('charged','name')}</th>
                      <th onClick={()=> toggleSort('charged','type')}>T{sortArrow('charged','type')}</th>
                      <th onClick={()=> toggleSort('charged','energy')}>E{sortArrow('charged','energy')}</th>
                      <th onClick={()=> toggleSort('charged','power')}>D{sortArrow('charged','power')}</th>
                      <th>EF</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargedMovesFiltered.map((m,i)=>(
                      <tr key={m.moveId}>
                        <td>{i+1}. {m.nameEs || m.name} <span className="move-en">({m.name})</span></td>
                        <td>{translateType(m.type)}</td>
                        <td>{m.energy}</td>
                        <td>{m.power}</td>
                        <td className="small">{formatMoveEffect(m) || '—'}</td>
                        <td><button className="btn" onClick={()=> setMoveLearners({ moveId:m.moveId, isFast:false })}>Ver Pokémon</button></td>
                      </tr>
                    ))}
                    {chargedMovesFiltered.length===0 && (
                      <tr><td colSpan={6} className="small" style={{textAlign:'center', padding:16}}>Sin resultados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="modal" onClick={()=> setSelected(null)}>
          <div className="modal-card" onClick={e=> e.stopPropagation()} style={{maxWidth:900}}>
            <div className="row" style={{marginBottom:12}}>
              <h2 style={{fontSize:22}}>#{selected.newRank} {formatName(selected.name)} <span style={{fontWeight:400, fontSize:14, color:'var(--muted)'}}>{selected.tipos.length? `(${translateTypes(selected.tipos)})`:''}</span></h2>
              <button className="btn" onClick={()=> setSelected(null)}>Cerrar</button>
            </div>

            {/* 8. Recuadros más pequeños + espacio para imagen base64 */}
            <div className="detail-grid-top">
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <div style={{background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:14, color:'var(--muted)', display:'block'}}>Ranking Actual</b>
                  <span style={{fontSize:22, fontWeight:800, color:'var(--blue)'}}>#{selected.newRank}</span>
                </div>
                <div style={{background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:14, color:'var(--muted)', display:'block'}}>Score Actual</b>
                  <span style={{fontSize:22, fontWeight:800}}>{selected.cur.score}</span>
                </div>
              </div>
              <div style={{background:'var(--near-bg)', border:'1px dashed var(--dashed-border)', borderRadius:12, height:130, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
                <PokeImg id={selected.id} name={selected.name} placeholder={<span style={{fontSize:11, color:'var(--muted)', textAlign:'center'}}>Sin imagen<br/>{selected.id}</span>} />
              </div>
            </div>

            {statsYIV && (
              <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:10}}>
                <div style={{background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px'}}>
                  <div className="row">
                    <b style={{fontSize:13}}>Mejor IV ({statsYIV.mejorIV.atk}/{statsYIV.mejorIV.def}/{statsYIV.mejorIV.hp})</b>
                    <span className="small">Nivel {statsYIV.mejorIV.level}</span>
                  </div>
                  <div style={{display:'flex', gap:16, marginTop:6}}>
                    <span className="small">Ataque: <b style={{color:'var(--text)'}}>{statsYIV.mejorIV.statAtk.toFixed(1)}</b></span>
                    <span className="small">Defensa: <b style={{color:'var(--text)'}}>{statsYIV.mejorIV.statDef.toFixed(1)}</b></span>
                    <span className="small">Salud: <b style={{color:'var(--text)'}}>{statsYIV.mejorIV.statHp}</b></span>
                  </div>
                </div>
                {statsYIV.ganaCMP && (
                  <div style={{background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px'}}>
                    <div className="row">
                      <b style={{fontSize:13}}>Mejor IV (Gana CMP) ({statsYIV.ganaCMP.atk}/{statsYIV.ganaCMP.def}/{statsYIV.ganaCMP.hp})</b>
                      <span className="small">Nivel {statsYIV.ganaCMP.level}</span>
                    </div>
                    <div style={{display:'flex', gap:16, marginTop:6}}>
                      <span className="small">Ataque: <b style={{color:'var(--text)'}}>{statsYIV.ganaCMP.statAtk.toFixed(1)}</b></span>
                      <span className="small">Defensa: <b style={{color:'var(--text)'}}>{statsYIV.ganaCMP.statDef.toFixed(1)}</b></span>
                      <span className="small">Salud: <b style={{color:'var(--text)'}}>{statsYIV.ganaCMP.statHp}</b></span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(()=>{
              const fc = formChangeMap[selected.id] || formChangeMap[originalFormIdMap[selected.id]]
              const desc = describeFormChange(fc)
              if(!desc) return null
              return (
                <div style={{marginTop:14, background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px'}}>
                  <b style={{fontSize:13}}>⚡ Mecánica especial</b>
                  <div className="small" style={{marginTop:4}}>{desc}</div>
                </div>
              )
            })()}

            <div style={{marginTop:14}}>
              <b>Ataques Recomendados</b>
              <div style={{marginTop:6, display:'flex', gap:6, flexWrap:'wrap'}}>
                {selected.cur.moveset?.map((m,i)=>{
                  const full = getMoveFull(m)
                  const efecto = formatMoveEffect(full)
                  return (
                    <div key={i} className="chip" style={{background:'var(--accent-chip-bg)', fontSize:12, display:'flex', flexDirection:'column', padding:'6px 8px', maxWidth:220}}>
                      <span>{translateMove(m)}</span>
                      {full && <span style={{fontSize:9, color:'var(--muted)'}}>{translateType(full.type)} {(full.energyGain||0) > 0 ? `${full.power}dmg/${full.energyGain}e/${full.turns}t` : `${full.power}dmg/${full.energy}e`}</span>}
                      {efecto && <span style={{fontSize:9, color:'var(--blue)', marginTop:2}}>{efecto}</span>}
                    </div>
                  )
                })}
              </div>
              {/* 3. Otros sin recomendados y sin ingles */}
              <div className="small" style={{marginTop:10}}>
                {(()=>{
                  const rec = new Set(selected.cur.moveset?.map((m:string)=> m.replace('*','')) || [])
                  const fastOtros = (selected.cur.moves?.fastMoves||[]).filter((mm:MoveDetail)=> !rec.has(mm.moveId)).map((mm:MoveDetail)=> translateMove(mm.moveId))
                  const chargedOtros = (selected.cur.moves?.chargedMoves||[]).filter((mm:MoveDetail)=> !rec.has(mm.moveId)).map((mm:MoveDetail)=> translateMove(mm.moveId))
                  return (
                    <>
                      {fastOtros.length>0 && <div><b>Rápidos otros:</b> {fastOtros.join(', ')}</div>}
                      {chargedOtros.length>0 && <div><b>Cargados otros:</b> {chargedOtros.join(', ')}</div>}
                    </>
                  )
                })()}
              </div>
            </div>

            <div className="detail-grid-two" style={{marginTop:14}}>
              <div>
                <b>5 Mejores Match (actual)</b>
                {selected.cur.matchups?.slice(0,5).map((m,i)=>{
                  const rank = getRankingForOpponent(m.opponent)
                  return (
                    <div key={i} className="row small" style={{marginTop:6, borderBottom:'1px solid var(--border)', paddingBottom:4}}>
                      <span>{formatName(m.opponent)}</span>
                      <span style={{fontWeight:700}}>{rank ? `Top #${rank}` : ''}</span>
                    </div>
                  )
                })}
              </div>
              <div>
                <b>5 Hard Counters (actual)</b>
                {selected.cur.counters?.slice(0,5).map((m,i)=>{
                  const rank = getRankingForOpponent(m.opponent)
                  return (
                    <div key={i} className="row small" style={{marginTop:6, borderBottom:'1px solid var(--border)', paddingBottom:4}}>
                      <span>{formatName(m.opponent)}</span>
                      <span style={{fontWeight:700}}>{rank ? `Top #${rank}` : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{marginTop:14}}>
              <div className="row" style={{marginBottom:6}}>
                <b>Mejores Acompañantes</b>
                <select className="search" style={{width:'auto', padding:'4px 8px', fontSize:12}} value={acompN} onChange={e=> setAcompN(parseInt(e.target.value))}>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={20}>Top 20</option>
                </select>
              </div>
              {acompanantes.slice(0, acompN).map((a,i)=>(
                <div key={a.compared.id} className="small" style={{marginTop:6, borderBottom:'1px solid var(--border)', paddingBottom:6}}>
                  <div className="row">
                    <span style={{fontWeight:700}}>{formatName(a.compared.name)}</span>
                    <span style={{fontWeight:700}}>Top #{a.compared.newRank}</span>
                  </div>
                  <div style={{color:'var(--muted)', marginTop:2}}>{a.reasons.join(' • ')}</div>
                </div>
              ))}
              {acompanantes.length===0 && (
                <div className="small" style={{color:'var(--muted)', marginTop:6}}>No se encontraron acompañantes recomendados.</div>
              )}
            </div>

            <div style={{marginTop:18}}>
              <b>Performance (ordenado alrededor del hexágono)</b>
              <div style={{position:'relative', width:'100%', maxWidth:320, margin:'10px auto'}}>
                <svg viewBox="0 0 200 200" className="hex" style={{width:'100%', height:220}}>
                  <polygon points="100,20 169,60 169,140 100,180 31,140 31,60" fill="none" stroke="var(--border)" strokeWidth="1"/>
                  {(() =>{
                    const s = selected.cur.scores || [0,0,0,0,0,0]
                    const points = s.map((v,i)=>{
                      const angle = (i*60-90)*Math.PI/180
                      const r = (v/100)*80
                      return `${100+ r*Math.cos(angle)},${100+ r*Math.sin(angle)}`
                    }).join(' ')
                    return <polygon points={points} fill="rgba(56,189,248,0.2)" stroke="var(--blue)" strokeWidth="2"/>
                  })()}
                  <text x="100" y="12" textAnchor="middle" fontSize="8" fill="var(--muted)">Lead: {(selected.cur.scores?.[0]||0)}</text>
                  <text x="178" y="55" textAnchor="start" fontSize="8" fill="var(--muted)">Closer: {(selected.cur.scores?.[1]||0)}</text>
                  <text x="178" y="145" textAnchor="start" fontSize="8" fill="var(--muted)">Switch: {(selected.cur.scores?.[2]||0)}</text>
                  <text x="100" y="195" textAnchor="middle" fontSize="8" fill="var(--muted)">Charger: {(selected.cur.scores?.[3]||0)}</text>
                  <text x="22" y="145" textAnchor="end" fontSize="8" fill="var(--muted)">Attacker: {(selected.cur.scores?.[4]||0)}</text>
                  <text x="22" y="55" textAnchor="end" fontSize="8" fill="var(--muted)">Cons: {(selected.cur.scores?.[5]||0)}</text>
                </svg>
              </div>
            </div>

          </div>
        </div>
      )}

      {moveLearners && (
        <div className="modal" onClick={()=> setMoveLearners(null)}>
          <div className="modal-card" onClick={e=> e.stopPropagation()} style={{maxWidth:760}}>
            <div className="row" style={{marginBottom:6}}>
              <h2 style={{fontSize:18}}>Pokémon que aprenden: {translateMove(moveLearners.moveId)}</h2>
              <button className="btn" onClick={()=> setMoveLearners(null)}>Cerrar</button>
            </div>
            <div className="small" style={{marginBottom:12}}>{learnersFor.length} Pokémon en {LIGAS[liga].label} (ambas temporadas cargadas)</div>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {learnersFor.length===0 && <div className="small">No se encontró ningún Pokémon con este movimiento en los datos cargados.</div>}
              {learnersFor.map(p=>{
                const fastMoves = p.moves?.fastMoves || []
                const chargedMoves = p.moves?.chargedMoves || []
                return (
                  <div key={p.speciesId} style={{background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-start'}}>
                    <div style={{width:48, height:48, background:'var(--card)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden', border:'1px solid var(--border)'}}>
                      <PokeImg id={p.speciesId} name={p.speciesName} />
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:800, marginBottom:4}}>{formatName(p.speciesName)}</div>
                      <div className="small">
                        <b>Rápidos:</b>{' '}
                        {fastMoves.map((m,i)=>(
                          <span key={i}>{i>0 && ', '}{m.moveId===moveLearners.moveId ? <b style={{color:'var(--text)'}}>{translateMove(m.moveId)}</b> : translateMove(m.moveId)}</span>
                        ))}
                      </div>
                      <div className="small">
                        <b>Cargados:</b>{' '}
                        {chargedMoves.map((m,i)=>(
                          <span key={i}>{i>0 && ', '}{m.moveId===moveLearners.moveId ? <b style={{color:'var(--text)'}}>{translateMove(m.moveId)}</b> : translateMove(m.moveId)}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
