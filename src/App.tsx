
import { useEffect, useMemo, useRef, useState } from 'react'

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
  power:number, energy:number, energyGain:number, isFast:number, cooldown:number, turns:number
}

// Formato de cada movimiento dentro del archivo que se descarga para actualizar
// los movimientos de la próxima temporada (moves_actualizados.json). Ese archivo
// puede venir como array plano, o como export completo tipo "gamemaster" con los
// movimientos anidados en la clave "moves" (así es como lo genera el usuario).
type MoveOverride = {
  moveId:string, name:string, type:string, power:number, energy:number,
  energyGain:number, cooldown:number, turns:number
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

type SectionKey = 'rankings' | 'movimientos'
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

export default function App(){
  const visitas = useVisitCounter()
  const [theme, setTheme] = useState<ThemeKey>(()=>{
    try{
      const saved = window.localStorage.getItem('comparador_theme')
      if(saved==='light' || saved==='dark') return saved
    }catch{}
    return 'dark'
  })

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
  const [typesMap, setTypesMap] = useState<Record<string,string[]>>({})
  const [imagesMap, setImagesMap] = useState<Record<string,string>>({})
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
  const [fastOpen, setFastOpen] = useState(true)
  const [chargedOpen, setChargedOpen] = useState(true)

  useEffect(()=>{
    async function load(){
      try{
        const folder = LIGAS[liga].folder
        const [oldRes, newRes, movesRes, movesFullRes, movesActualizadosRes, typesRes, imgRes, logosRes] = await Promise.all([
          fetch(`/data/${folder}/siempre_adelante.json`).catch(()=> null),
          fetch(`/data/${folder}/caminos_crepusculares.json`).catch(()=> null),
          fetch('/data/moves.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({})),
          fetch('/data/moves_full.json').then(r=> r.ok ? r.json() : []).catch(()=> []),
          fetch('/data/moves_actualizados.json').then(r=> r.ok ? r.json() : null).catch(()=> null),
          fetch('/data/pokemon_types.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({})),
          fetch('/data/pokemon_images.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({})),
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
        setOldData(a); setNewData(b); setMovesEs(movesRes||{}); setMovesFull(fullMap); setMovesActualizados(overrides); setTypesMap(typesRes||{}); setImagesMap(imgRes||{}); setLeagueLogos(logosRes||{})
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
      }
    })
    return merged
  },[movesFull, movesActualizados])

  const translateMove = (moveId:string) => {
    if(!moveId) return moveId
    const clean = moveId.replace('*','')
    return movesEs[clean] || movesEs[moveId] || clean.replace(/_/g,' ')
  }
  const getMoveFull = (moveId:string): MoveFull | null => {
    const clean = moveId.replace('*','')
    // El modal de detalle siempre muestra el pokémon de la temporada "cur" (casi
    // siempre Caminos Crepusculares / temporada actual), por eso usa los stats actualizados.
    return movesFullActual[clean] || movesFullActual[moveId] || null
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

  // Pokémon (unión de ambas temporadas de la liga activa) que aprenden el movimiento seleccionado.
  // Importante: un pokémon puede aprender un movimiento en una temporada y no en la otra (ej. Volbeat
  // con Acoso en Caminos Crepusculares), así que unimos fastMoves/chargedMoves de ambas temporadas
  // en vez de quedarnos solo con la primera aparición (y así también el resaltado en negrita funciona
  // sin importar de qué temporada venga el movimiento).
  const learnersFor = useMemo(()=>{
    if(!moveLearners) return []
    const { moveId } = moveLearners
    const byId = new Map<string, { display: PokemonEntry, fastMoves: MoveDetail[], chargedMoves: MoveDetail[] }>()
    ;[...oldData, ...newData].forEach(p=>{
      const existing = byId.get(p.speciesId)
      if(!existing){
        byId.set(p.speciesId, {
          display: p,
          fastMoves: [...(p.moves?.fastMoves||[])],
          chargedMoves: [...(p.moves?.chargedMoves||[])],
        })
      } else {
        const fastIds = new Set(existing.fastMoves.map(m=> m.moveId))
        ;(p.moves?.fastMoves||[]).forEach(m=>{ if(!fastIds.has(m.moveId)) existing.fastMoves.push(m) })
        const chargedIds = new Set(existing.chargedMoves.map(m=> m.moveId))
        ;(p.moves?.chargedMoves||[]).forEach(m=>{ if(!chargedIds.has(m.moveId)) existing.chargedMoves.push(m) })
        existing.display = p // newData llega después en el array: prioriza mostrar los demás datos (score, etc.) de la temporada actual
      }
    })
    const result: (PokemonEntry & { moves: { fastMoves:MoveDetail[], chargedMoves:MoveDetail[] } })[] = []
    byId.forEach(({ display, fastMoves, chargedMoves })=>{
      const learns = fastMoves.some(m=> m.moveId===moveId) || chargedMoves.some(m=> m.moveId===moveId)
      if(learns) result.push({ ...display, moves: { fastMoves, chargedMoves } })
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
          <h1 className="main-title" style={{textAlign:'center'}}>SELECCIONAR LIGA A ANALIZAR:</h1>

          <div className="league-btns" style={{justifyContent:'center', marginTop:16}}>
            {(Object.keys(LIGAS) as LigaKey[]).map(key=>(
              <button
                key={key}
                className={`league-btn ${LIGAS[key].className} ${liga===key ? 'pressed' : ''}`}
                onClick={()=> handleLigaChange(key)}
              >
                {leagueLogos[key] && <img src={leagueLogos[key]} alt="" width={24} height={24} />}
                {LIGAS[key].label}
              </button>
            ))}
          </div>

          <div style={{display:'flex', justifyContent:'center', marginTop:14}}>
            <button className="theme-toggle-btn" onClick={()=> setTheme(t=> t==='dark' ? 'light' : 'dark')}>
              {theme==='dark' ? '☀️ Fondo claro' : '🌙 Fondo oscuro'}
            </button>
          </div>

          <p className="welcome-banner" style={{marginTop:28, textAlign:'center'}}>
            Bienvenido, tómate tu tiempo en analizar para aprender todo sobre la nueva temporada.
            <br/><br/>
            Puedes apoyar mi canal de YouTube llamado{' '}
            <a href="https://www.youtube.com/@EntrenadorGuayD" target="_blank" rel="noopener noreferrer">Entrenador GuayD</a>
            {' '}suscribiéndote y activando las notificaciones como señal de apoyo 🔔
          </p>
        </div>
      </div>

      <div className="sticky-section-nav">
        <div className="container">
          <div className="section-nav" style={{justifyContent:'center', margin:0}}>
            <button className={`section-btn ${section==='rankings' ? 'active' : ''}`} onClick={()=> setSection('rankings')}>📊 Rankings</button>
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
                Utiliza el buscador o selecciona los filtros para saber más de los cambios.
                <br/>
                También puedes ordenarlos para saber cuántas posiciones subieron.
              </div>
            )}

            <div className={`filter-frame ${search.trim() ? 'filter-frame-active' : ''}`}>
              <input className="search" placeholder="Buscar Pokémon... ej: Azumarill, Quagsire, Tinkaton" value={search} onChange={e=> setSearch(e.target.value)} />
            </div>

            <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
              <div className={`filter-frame ${activeFilterKey==='mejoraron' ? 'filter-frame-active' : ''}`} style={{flex:1, minWidth:220, display:'flex', flexDirection:'column', gap:10}}>
                <div>
                  <label className="filter-label-big">🚀 Pokémon que Mejoraron</label>
                  <select className="search" value={mejoraronSel} onChange={e=> handleMejoraronChange(e.target.value)}>
                    <option value="10">Top 10 Mejoraron</option>
                    <option value="30">Top 30 Mejoraron</option>
                    <option value="50">Top 50 Mejoraron</option>
                    <option value="100">Top 100 Mejoraron</option>
                    <option value="200">Top 200 Mejoraron</option>
                    <option value="TODOS">TODOS los que mejoraron</option>
                  </select>
                </div>
                <div>
                  <label className="small" style={{display:'block', marginBottom:4}}>Ordenar por</label>
                  <select className="search" value={ordenMejoraron} onChange={e=> setOrdenMejoraron(e.target.value as 'ranking'|'escalones')}>
                    <option value="ranking">N° en Ranking</option>
                    <option value="escalones">N° de Escalones</option>
                  </select>
                </div>
              </div>
              <div className={`filter-frame ${activeFilterKey==='decayeron' ? 'filter-frame-active' : ''}`} style={{flex:1, minWidth:220, display:'flex', flexDirection:'column', gap:10}}>
                <div>
                  <label className="filter-label-big">📉 Pokémon que Decayeron</label>
                  <select className="search" value={decayeronSel} onChange={e=> handleDecayeronChange(e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    <option value="10">Top 10 Decayeron</option>
                    <option value="20">Top 20 Decayeron</option>
                    <option value="30">Top 30 Decayeron</option>
                    <option value="50">Top 50 Decayeron</option>
                    <option value="200">Top 200 Decayeron</option>
                    <option value="TODOS">TODOS los que decayeron</option>
                  </select>
                </div>
                <div>
                  <label className="small" style={{display:'block', marginBottom:4}}>Ordenar por</label>
                  <select className="search" value={ordenDecayeron} onChange={e=> setOrdenDecayeron(e.target.value as 'ranking'|'escalones')}>
                    <option value="ranking">N° en Ranking</option>
                    <option value="escalones">N° de Escalones</option>
                  </select>
                </div>
              </div>
              <div className={`filter-frame ${activeFilterKey==='completo' ? 'filter-frame-active' : ''}`} style={{flex:1, minWidth:220, display:'flex', flexDirection:'column', gap:10}}>
                <div>
                  <label className="filter-label-big">📊 Ver todo el Ranking</label>
                  <select className="search" value={rankingCompletoSel} onChange={e=> handleCompletoChange(e.target.value)}>
                    <option value="">-- Seleccionar Ranking --</option>
                    <option value="caminos">Ranking Temporada Actual</option>
                    <option value="siempre">Ranking Temporada Anterior</option>
                  </select>
                </div>
              </div>
            </div>

            <div className={`filter-frame ${(activeFilterKey || search.trim()) ? 'filter-frame-active' : ''}`}>
              {searchResults!==null ? (
                <>
                  {searchResults.length===0 ? (
                    <div className="notice">
                      No se encontró ningún Pokémon para "{search}" en {LIGAS[liga].label}. Si es un legendario/mítico, puede que no sea elegible por CP para esta liga (no puede bajar de su tope de CP) — prueba buscarlo en Liga Master.
                    </div>
                  ) : (
                    <div className="small">{searchResults.length} resultado(s) para "{search}" • búsqueda en todo el ranking, sin importar filtros</div>
                  )}
                  <div className="grid" style={{marginTop:10}}>
                    {searchResults.map(c=>(
                      <div key={c.id} className="card" onClick={()=> setSelected(c)} style={{cursor:'pointer', display:'flex', gap:10}}>
                        <div style={{width:64, height:64, background:'var(--card2)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid var(--border)', overflow:'hidden'}}>
                          {imagesMap[c.id] ? <img src={imagesMap[c.id]} alt={c.name} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:10, color:'var(--placeholder)'}}>imagen</span>}
                        </div>
                        <div style={{flex:1}}>
                          <div className="row">
                            <div style={{display:'flex', flexDirection:'column'}}>
                              <div className="rank" style={{fontSize:20}}>#{c.newRank} {formatName(c.name)} <span style={{fontWeight:400, fontSize:13, color:'var(--muted)'}}>{c.tipos.length? `(${c.tipos.join('/')})`:''}</span></div>
                              <div style={{display:'flex', gap:12, marginTop:4}}>
                                <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Antes <b style={{color:'var(--text)', fontSize:14}}>#{c.oldRank}</b></span>
                                <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Ahora <b style={{color:'var(--blue)', fontSize:14}}>#{c.newRank}</b></span>
                              </div>
                            </div>
                            {(c.delta!==0 || c.mejora!==0) && (
                              <span className="badge" style={{fontSize:12, padding:'4px 8px', background: c.delta>0 ? 'var(--red-bg)' : 'var(--green-bg)', color: c.delta>0 ? 'var(--red-text)' : 'var(--green-text)', display:'flex', gap:4, alignItems:'center'}}>
                                {c.delta>0 ? `cayó: ▼ ${c.delta}` : `escaló: ▲ +${c.mejora}`}
                              </span>
                            )}
                          </div>
                          <div className="moves" style={{marginTop:8}}>
                            <div><b>Rápido:</b> {translateMove(c.cur.moveset?.[0]||'')}</div>
                            <div><b>Cargados:</b> {(c.cur.moveset?.slice(1)||[]).map(m=> translateMove(m)).join(', ')}</div>
                          </div>
                          <div style={{display:'flex',gap:4,flexWrap:'wrap', marginTop:6}}>
                            {c.cur.moveset?.map((m,i)=> <span key={i} className="chip">{translateMove(m)}</span>)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : activeTab!=='completo' && (
                <>
                  <div className="small">{displayList.length} resultados • {activeTab==='mejoraron' ? `Top ${mejoraronSel} que mejoraron (${ordenMejoraron==='escalones' ? 'orden por escalones' : 'orden por ranking'})` : `Top ${decayeronSel} que decayeron (${ordenDecayeron==='escalones' ? 'orden por escalones' : 'orden por ranking'})`} • Click en el mismo filtro recarga</div>
                  <div className="grid" style={{marginTop:10}}>
                    {displayList.map(c=>(
                      <div key={c.id} className="card" onClick={()=> setSelected(c)} style={{cursor:'pointer', display:'flex', gap:10}}>
                        <div style={{width:64, height:64, background:'var(--card2)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid var(--border)', overflow:'hidden'}}>
                          {imagesMap[c.id] ? <img src={imagesMap[c.id]} alt={c.name} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:10, color:'var(--placeholder)'}}>imagen</span>}
                        </div>
                        <div style={{flex:1}}>
                          <div className="row">
                            <div style={{display:'flex', flexDirection:'column'}}>
                              <div className="rank" style={{fontSize:20}}>#{c.newRank} {formatName(c.name)} <span style={{fontWeight:400, fontSize:13, color:'var(--muted)'}}>{c.tipos.length? `(${c.tipos.join('/')})`:''}</span></div>
                              <div style={{display:'flex', gap:12, marginTop:4}}>
                                <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Antes <b style={{color:'var(--text)', fontSize:14}}>#{c.oldRank}</b></span>
                                <span style={{fontSize:13, fontWeight:700, color:'var(--muted)'}}>Ahora <b style={{color:'var(--blue)', fontSize:14}}>#{c.newRank}</b></span>
                              </div>
                            </div>
                            <span className="badge" style={{fontSize:12, padding:'4px 8px', background: c.delta>0 ? 'var(--red-bg)' : 'var(--green-bg)', color: c.delta>0 ? 'var(--red-text)' : 'var(--green-text)', display:'flex', gap:4, alignItems:'center'}}>
                              {c.delta>0 ? `cayó: ▼ ${c.delta}` : `escaló: ▲ +${c.mejora}`}
                            </span>
                          </div>
                          <div className="moves" style={{marginTop:8}}>
                            <div><b>Rápido:</b> {translateMove(c.cur.moveset?.[0]||'')}</div>
                            <div><b>Cargados:</b> {(c.cur.moveset?.slice(1)||[]).map(m=> translateMove(m)).join(', ')}</div>
                          </div>
                          <div style={{display:'flex',gap:4,flexWrap:'wrap', marginTop:6}}>
                            {c.cur.moveset?.map((m,i)=> <span key={i} className="chip">{translateMove(m)}</span>)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {searchResults===null && activeTab==='completo' && (
                <>
                  <div className="small">Mostrando {rankingCompletoSel==='caminos' ? LIGAS[liga].newLabel : LIGAS[liga].oldLabel} - {rankingCompletoSel==='caminos' ? completoCaminos.length : completoSiempre.length} Pokémon</div>
                  <div className="grid" style={{marginTop:10}}>
                    {(rankingCompletoSel==='caminos' ? completoCaminos : completoSiempre).map((p:any)=>(
                      <div key={p.speciesId} className="card" style={{display:'flex', gap:10, alignItems:'center'}}>
                        <div style={{width:56, height:56, background:'var(--card2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid var(--border)', flexShrink:0}}>
                          {imagesMap[p.speciesId] ? <img src={imagesMap[p.speciesId]} alt={p.speciesName} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:9, color:'var(--placeholder)'}}>imagen</span>}
                        </div>
                        <div style={{flex:1}}>
                          <div className="rank" style={{fontSize:18}}>#{p.rankActual} {formatName(p.speciesName)}</div>
                          <div className="moves" style={{marginTop:4}}><b>Rápido:</b> {translateMove(p.moveset?.[0])} <br/><b>Cargados:</b> {p.moveset?.slice(1).map((m:string)=> translateMove(m)).join(', ')}</div>
                        </div>
                        <button className="btn" style={{flexShrink:0, whiteSpace:'nowrap'}} onClick={()=> setSelected(buildCompared(p, p.rankActual))}>Más información</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
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
            <div className="moves-columns">
              <div>
                <div className="moves-section-header">
                  <h2 style={{fontSize:18}}>⚡ Movimientos Rápidos <span className="small">({fastMovesFiltered.length})</span></h2>
                  <button className="btn collapse-btn" onClick={()=> setFastOpen(o=> !o)} aria-label="Mostrar/ocultar Movimientos Rápidos">
                    {fastOpen ? '▲ Ocultar' : '▼ Mostrar'}
                  </button>
                </div>
                {fastOpen && (
                <div className="moves-table-wrap">
                  <table className="moves-table">
                    <thead>
                      <tr>
                        <th onClick={()=> toggleSort('fast','name')}>Nombre{sortArrow('fast','name')}</th>
                        <th onClick={()=> toggleSort('fast','type')}>Tipo{sortArrow('fast','type')}</th>
                        <th onClick={()=> toggleSort('fast','energy')}>Energía que genera{sortArrow('fast','energy')}</th>
                        <th onClick={()=> toggleSort('fast','power')}>Daño{sortArrow('fast','power')}</th>
                        <th onClick={()=> toggleSort('fast','turns')}>Turnos{sortArrow('fast','turns')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fastMovesFiltered.map((m,i)=>(
                        <tr key={m.moveId}>
                          <td>{i+1}. {m.nameEs || m.name} <span className="move-en">({m.name})</span></td>
                          <td>{capitalize(m.type)}</td>
                          <td>{m.energyGain}</td>
                          <td>{m.power}</td>
                          <td>{m.turns ?? Math.round((m.cooldown||0)/500)}</td>
                          <td><button className="btn" onClick={()=> setMoveLearners({ moveId:m.moveId, isFast:true })}>Ver Pokémon que aprenden</button></td>
                        </tr>
                      ))}
                      {fastMovesFiltered.length===0 && (
                        <tr><td colSpan={6} className="small" style={{textAlign:'center', padding:16}}>Sin resultados</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>

              <div>
                <div className="moves-section-header">
                  <h2 style={{fontSize:18}}>💥 Movimientos Cargados <span className="small">({chargedMovesFiltered.length})</span></h2>
                  <button className="btn collapse-btn" onClick={()=> setChargedOpen(o=> !o)} aria-label="Mostrar/ocultar Movimientos Cargados">
                    {chargedOpen ? '▲ Ocultar' : '▼ Mostrar'}
                  </button>
                </div>
                {chargedOpen && (
                <div className="moves-table-wrap">
                  <table className="moves-table">
                    <thead>
                      <tr>
                        <th onClick={()=> toggleSort('charged','name')}>Nombre{sortArrow('charged','name')}</th>
                        <th onClick={()=> toggleSort('charged','type')}>Tipo{sortArrow('charged','type')}</th>
                        <th onClick={()=> toggleSort('charged','energy')}>Energía que requiere{sortArrow('charged','energy')}</th>
                        <th onClick={()=> toggleSort('charged','power')}>Daño{sortArrow('charged','power')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {chargedMovesFiltered.map((m,i)=>(
                        <tr key={m.moveId}>
                          <td>{i+1}. {m.nameEs || m.name} <span className="move-en">({m.name})</span></td>
                          <td>{capitalize(m.type)}</td>
                          <td>{m.energy}</td>
                          <td>{m.power}</td>
                          <td><button className="btn" onClick={()=> setMoveLearners({ moveId:m.moveId, isFast:false })}>Ver Pokémon que aprenden</button></td>
                        </tr>
                      ))}
                      {chargedMovesFiltered.length===0 && (
                        <tr><td colSpan={5} className="small" style={{textAlign:'center', padding:16}}>Sin resultados</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="modal" onClick={()=> setSelected(null)}>
          <div className="modal-card" onClick={e=> e.stopPropagation()} style={{maxWidth:900}}>
            <div className="row" style={{marginBottom:12}}>
              <h2 style={{fontSize:22}}>#{selected.newRank} {formatName(selected.name)} <span style={{fontWeight:400, fontSize:14, color:'var(--muted)'}}>{selected.tipos.length? `(${selected.tipos.join('/')})`:''}</span></h2>
              <button className="btn" onClick={()=> setSelected(null)}>Cerrar</button>
            </div>

            {/* 8. Recuadros más pequeños + espacio para imagen base64 */}
            <div className="detail-grid-top">
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <div style={{background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:14, color:'var(--muted)', display:'block'}}>Ranking Antiguo</b>
                  <span style={{fontSize:22, fontWeight:800}}>#{selected.oldRank}</span>
                </div>
                <div style={{background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:14, color:'var(--muted)', display:'block'}}>Puestos Subidos</b>
                  <span style={{fontSize:22, fontWeight:800, color: selected.delta>0 ? 'var(--red)' : 'var(--green)'}}>{selected.delta>0 ? `▼ ${selected.delta}` : `▲ +${selected.mejora}`}</span>
                </div>
              </div>
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
                {imagesMap[selected.id] ? <img src={imagesMap[selected.id]} alt={selected.name} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:11, color:'var(--muted)', textAlign:'center'}}>Espacio<br/>imagen base64<br/>{selected.id}</span>}
              </div>
            </div>

            <div style={{marginTop:14}}>
              <b>Ataques Recomendados</b>
              <div style={{marginTop:6, display:'flex', gap:6, flexWrap:'wrap'}}>
                {selected.cur.moveset?.map((m,i)=>{
                  const full = getMoveFull(m)
                  return (
                    <div key={i} className="chip" style={{background:'var(--accent-chip-bg)', fontSize:12, display:'flex', flexDirection:'column', padding:'6px 8px'}}>
                      <span>{translateMove(m)}</span>
                      {full && <span style={{fontSize:9, color:'var(--muted)'}}>{full.type} {(full.energyGain||0) > 0 ? `${full.power}dmg/${full.energyGain}e/${full.turns}t` : `${full.power}dmg/${full.energy}e`}</span>}
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
                      {imagesMap[p.speciesId] ? <img src={imagesMap[p.speciesId]} alt={p.speciesName} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:9, color:'var(--placeholder)'}}>img</span>}
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
