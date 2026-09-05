
import { useEffect, useMemo, useState } from 'react'

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

type Compared = {
  id:string, name:string, oldRank:number, newRank:number, delta:number, mejora:number,
  old: PokemonEntry, cur: PokemonEntry, tipos:string[]
}

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

export default function App(){
  const [oldData, setOldData] = useState<PokemonEntry[]>([])
  const [newData, setNewData] = useState<PokemonEntry[]>([])
  const [movesEs, setMovesEs] = useState<Record<string,string>>({})
  const [movesFull, setMovesFull] = useState<Record<string,MoveFull>>({})
  const [typesMap, setTypesMap] = useState<Record<string,string[]>>({})
  const [imagesMap, setImagesMap] = useState<Record<string,string>>({})
  const [mejoraronSel, setMejoraronSel] = useState<string>('50')
  const [decayeronSel, setDecayeronSel] = useState<string>('')
  const [rankingCompletoSel, setRankingCompletoSel] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'mejoraron'|'decayeron'|'completo'>('mejoraron')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Compared|null>(null)
  const [debug, setDebug] = useState<string>('')
  const [reloadKey, setReloadKey] = useState<number>(0)

  useEffect(()=>{
    async function load(){
      try{
        const [oldRes, newRes, movesRes, movesFullRes, typesRes, imgRes] = await Promise.all([
          fetch('/data/siempre_adelante.json'),
          fetch('/data/caminos_crepusculares.json'),
          fetch('/data/moves.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({})),
          fetch('/data/moves_full.json').then(r=> r.ok ? r.json() : []).catch(()=> []),
          fetch('/data/pokemon_types.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({})),
          fetch('/data/pokemon_images.json').then(r=> r.ok ? r.json() : {}).catch(()=> ({}))
        ])
        const a = oldRes.ok ? await oldRes.json() : []
        const b = newRes.ok ? await newRes.json() : []
        const fullMap: Record<string,MoveFull> = {}
        if(Array.isArray(movesFullRes)){
          movesFullRes.forEach((m:MoveFull)=> fullMap[m.moveId] = m)
        }
        setOldData(a); setNewData(b); setMovesEs(movesRes||{}); setMovesFull(fullMap); setTypesMap(typesRes||{}); setImagesMap(imgRes||{})
        setDebug(`Cargados: Siempre ${a.length} / Caminos ${b.length} / Moves ES ${Object.keys(movesRes||{}).length} / Full ${Object.keys(fullMap).length}`)
      }catch(e:any){ setDebug('Error: '+ e.message) }
    }
    load()
  },[reloadKey])

  const translateMove = (moveId:string) => {
    if(!moveId) return moveId
    const clean = moveId.replace('*','')
    return movesEs[clean] || movesEs[moveId] || clean.replace(/_/g,' ')
  }
  const getMoveFull = (moveId:string): MoveFull | null => {
    const clean = moveId.replace('*','')
    return movesFull[clean] || movesFull[moveId] || null
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

  const mejoraronList = useMemo(()=>{ let f = compared.filter(c=> c.mejora>0); if(search) f=f.filter(c=> c.name.toLowerCase().includes(search.toLowerCase())); return f.sort((a,b)=> a.newRank - b.newRank) },[compared, search])
  const decayeronList = useMemo(()=>{ let f = compared.filter(c=> c.delta>0); if(search) f=f.filter(c=> c.name.toLowerCase().includes(search.toLowerCase())); return f.sort((a,b)=> a.newRank - b.newRank) },[compared, search])
  const completoCaminos = useMemo(()=>{ let f = [...newData]; if(search) f=f.filter(p=> p.speciesName.toLowerCase().includes(search.toLowerCase())); return f.map((p,i)=> ({...p, rankActual: (p as any).rank ?? i+1})).sort((a,b)=> a.rankActual - b.rankActual) },[newData, search])
  const completoSiempre = useMemo(()=>{ let f = [...oldData]; if(search) f=f.filter(p=> p.speciesName.toLowerCase().includes(search.toLowerCase())); return f.map((p,i)=> ({...p, rankActual: (p as any).rank_old ?? i+1})).sort((a,b)=> a.rankActual - b.rankActual) },[oldData, search])

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

  const displayList = activeTab==='mejoraron' ? filteredMejoraron : activeTab==='decayeron' ? filteredDecayeron : []

  const getRankingForOpponent = (opId:string): number | null => {
    return newRankMap.get(opId) || newRankMap.get(normalize(opId)) || null
  }

  return (
    <div>
      <div className="header">
        <div className="container">
          <h1>Comparador Liga Super</h1>
          <p>Siempre Adelante vs Caminos Crepusculares • {compared.length} Pokémon • {debug}</p>
        </div>
      </div>

      <div className="container" style={{display:'flex',flexDirection:'column',gap:12, marginTop:12}}>
        <input className="search" placeholder="Buscar Pokémon... ej: Azumarill, Quagsire, Tinkaton" value={search} onChange={e=> setSearch(e.target.value)} />

        <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
          <div style={{flex:1, minWidth:200}}>
            <label className="small" style={{display:'block', marginBottom:4}}>🚀 Pokémon que Mejoraron (orden por ranking actual)</label>
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
            <label className="small" style={{display:'block', marginBottom:4}}>📉 Pokémon que Decayeron (orden por ranking actual)</label>
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
          <div style={{flex:1, minWidth:200}}>
            <label className="small" style={{display:'block', marginBottom:4}}>📊 Ver todo el Ranking</label>
            <select className="search" value={rankingCompletoSel} onChange={e=> handleCompletoChange(e.target.value)}>
              <option value="">-- Seleccionar Ranking --</option>
              <option value="caminos">Ranking (Caminos Crepusculares) 1-1144</option>
              <option value="siempre">Ranking (Siempre Adelante) 1-1145</option>
            </select>
          </div>
        </div>

        {activeTab!=='completo' && (
          <>
            <div className="small">{displayList.length} resultados • {activeTab==='mejoraron' ? `Top ${mejoraronSel} que mejoraron` : `Top ${decayeronSel} que decayeron`} • Click en el mismo filtro recarga</div>
            <div className="grid">
              {displayList.map(c=>(
                <div key={c.id} className="card" onClick={()=> setSelected(c)} style={{cursor:'pointer', display:'flex', gap:10}}>
                  <div style={{width:64, height:64, background:'#1f242f', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid #2a3242', overflow:'hidden'}}>
                    {imagesMap[c.id] ? <img src={imagesMap[c.id]} alt={c.name} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:10, color:'#555'}}>imagen</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div className="row">
                      <div style={{display:'flex', flexDirection:'column'}}>
                        <div className="rank" style={{fontSize:20}}>#{c.newRank} {formatName(c.name)} <span style={{fontWeight:400, fontSize:13, color:'#9aa3b2'}}>{c.tipos.length? `(${c.tipos.join('/')})`:''}</span></div>
                        <div style={{display:'flex', gap:12, marginTop:4}}>
                          <span style={{fontSize:13, fontWeight:700, color:'#9aa3b2'}}>Antes <b style={{color:'#e6e8ee', fontSize:14}}>#{c.oldRank}</b></span>
                          <span style={{fontSize:13, fontWeight:700, color:'#9aa3b2'}}>Ahora <b style={{color:'#38bdf8', fontSize:14}}>#{c.newRank}</b></span>
                        </div>
                      </div>
                      <span className="badge" style={{fontSize:12, padding:'4px 8px', background: c.delta>0 ? '#3a1a1a' : '#143a23', color: c.delta>0 ? '#fca5a5' : '#86efac', display:'flex', gap:4, alignItems:'center'}}>
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

        {activeTab==='completo' && (
          <>
            <div className="small">Mostrando {rankingCompletoSel==='caminos' ? 'Caminos Crepusculares' : 'Siempre Adelante'} - {rankingCompletoSel==='caminos' ? completoCaminos.length : completoSiempre.length} Pokémon</div>
            <div className="grid">
              {(rankingCompletoSel==='caminos' ? completoCaminos : completoSiempre).map((p:any)=>(
                <div key={p.speciesId} className="card" style={{display:'flex', gap:10}}>
                  <div style={{width:56, height:56, background:'#1f242f', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #2a3242'}}>
                    {imagesMap[p.speciesId] ? <img src={imagesMap[p.speciesId]} alt={p.speciesName} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:9, color:'#555'}}>imagen</span>}
                  </div>
                  <div>
                    <div className="rank" style={{fontSize:18}}>#{p.rankActual} {formatName(p.speciesName)}</div>
                    <div className="moves" style={{marginTop:4}}><b>Rápido:</b> {translateMove(p.moveset?.[0])} <br/><b>Cargados:</b> {p.moveset?.slice(1).map((m:string)=> translateMove(m)).join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {selected && (
        <div className="modal" onClick={()=> setSelected(null)}>
          <div className="modal-card" onClick={e=> e.stopPropagation()} style={{maxWidth:900}}>
            <div className="row" style={{marginBottom:12}}>
              <h2 style={{fontSize:22}}>#{selected.newRank} {formatName(selected.name)} <span style={{fontWeight:400, fontSize:14, color:'#9aa3b2'}}>{selected.tipos.length? `(${selected.tipos.join('/')})`:''}</span></h2>
              <button className="btn" onClick={()=> setSelected(null)}>Cerrar</button>
            </div>

            {/* 8. Recuadros más pequeños + espacio para imagen base64 */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 200px', gap:10, alignItems:'start'}}>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <div style={{background:'#1f242f', border:'1px solid #2a3242', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:10, color:'#9aa3b2', display:'block'}}>Ranking Antiguo</b>
                  <span style={{fontSize:14, fontWeight:800}}>#{selected.oldRank}</span>
                </div>
                <div style={{background:'#1f242f', border:'1px solid #2a3242', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:10, color:'#9aa3b2', display:'block'}}>9. Puesto(s) Subido(s)</b>
                  <span style={{fontSize:13, fontWeight:800, color: selected.delta>0 ? '#f87171' : '#4ade80'}}>{selected.delta>0 ? `▼ ${selected.delta}` : `▲ +${selected.mejora}`}</span>
                </div>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <div style={{background:'#1f242f', border:'1px solid #2a3242', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:10, color:'#9aa3b2', display:'block'}}>Ranking Actual</b>
                  <span style={{fontSize:14, fontWeight:800, color:'#38bdf8'}}>#{selected.newRank}</span>
                </div>
                <div style={{background:'#1f242f', border:'1px solid #2a3242', borderRadius:10, padding:'8px 10px'}}>
                  <b style={{fontSize:10, color:'#9aa3b2', display:'block'}}>Score Actual</b>
                  <span style={{fontSize:13, fontWeight:700}}>{selected.cur.score}</span>
                </div>
              </div>
              <div style={{background:'#11151d', border:'1px dashed #3a455c', borderRadius:12, height:130, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
                {imagesMap[selected.id] ? <img src={imagesMap[selected.id]} alt={selected.name} style={{width:'100%', height:'100%', objectFit:'contain'}}/> : <span style={{fontSize:11, color:'#6b7280', textAlign:'center'}}>Espacio<br/>imagen base64<br/>{selected.id}</span>}
              </div>
            </div>

            <div style={{marginTop:14}}>
              <b>Ataques recomendados (actual) - Español</b>
              <div style={{marginTop:6, display:'flex', gap:6, flexWrap:'wrap'}}>
                {selected.cur.moveset?.map((m,i)=>{
                  const full = getMoveFull(m)
                  return (
                    <div key={i} className="chip" style={{background:'#2a344a', fontSize:12, display:'flex', flexDirection:'column', padding:'6px 8px'}}>
                      <span>{translateMove(m)}</span>
                      {full && <span style={{fontSize:9, color:'#9aa3b2'}}>{full.type} {full.isFast ? `${full.power}dmg/${full.energyGain}e/${full.turns}t` : `${full.power}dmg/${full.energy}e`}</span>}
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

            <div style={{marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
              <div>
                <b>5 Mejores Match (actual)</b>
                <div className="small" style={{color:'#9aa3b2', marginBottom:4}}>Ranking Actual</div>
                {selected.cur.matchups?.slice(0,5).map((m,i)=>{
                  const rank = getRankingForOpponent(m.opponent)
                  return (
                    <div key={i} className="row small" style={{marginTop:6, borderBottom:'1px solid #1f242f', paddingBottom:4}}>
                      <span>{formatName(m.opponent)}</span>
                      <span style={{fontWeight:700}}>{rank ? `#${rank}` : ''} <span style={{fontSize:10, color:'#6b7280'}}>Meta {m.rating}</span></span>
                    </div>
                  )
                })}
              </div>
              <div>
                <b>5 Hard Counters (actual)</b>
                <div className="small" style={{color:'#9aa3b2', marginBottom:4}}>Ranking Meta</div>
                {selected.cur.counters?.slice(0,5).map((m,i)=>{
                  const rank = getRankingForOpponent(m.opponent)
                  return (
                    <div key={i} className="row small" style={{marginTop:6, borderBottom:'1px solid #1f242f', paddingBottom:4}}>
                      <span>{formatName(m.opponent)}</span>
                      <span style={{fontWeight:700}}>{rank ? `#${rank}` : ''} <span style={{fontSize:10, color:'#6b7280'}}>Meta {m.rating}</span></span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{marginTop:18}}>
              <b>Performance (ordenado alrededor del hexágono)</b>
              <div style={{position:'relative', width:'100%', maxWidth:320, margin:'10px auto'}}>
                <svg viewBox="0 0 200 200" className="hex" style={{width:'100%', height:220}}>
                  <polygon points="100,20 169,60 169,140 100,180 31,140 31,60" fill="none" stroke="#2a3242" strokeWidth="1"/>
                  {(() =>{
                    const s = selected.cur.scores || [0,0,0,0,0,0]
                    const points = s.map((v,i)=>{
                      const angle = (i*60-90)*Math.PI/180
                      const r = (v/100)*80
                      return `${100+ r*Math.cos(angle)},${100+ r*Math.sin(angle)}`
                    }).join(' ')
                    return <polygon points={points} fill="rgba(56,189,248,0.2)" stroke="#38bdf8" strokeWidth="2"/>
                  })()}
                  <text x="100" y="12" textAnchor="middle" fontSize="8" fill="#9aa3b2">Lead: {(selected.cur.scores?.[0]||0)}</text>
                  <text x="178" y="55" textAnchor="start" fontSize="8" fill="#9aa3b2">Closer: {(selected.cur.scores?.[1]||0)}</text>
                  <text x="178" y="145" textAnchor="start" fontSize="8" fill="#9aa3b2">Switch: {(selected.cur.scores?.[2]||0)}</text>
                  <text x="100" y="195" textAnchor="middle" fontSize="8" fill="#9aa3b2">Charger: {(selected.cur.scores?.[3]||0)}</text>
                  <text x="22" y="145" textAnchor="end" fontSize="8" fill="#9aa3b2">Attacker: {(selected.cur.scores?.[4]||0)}</text>
                  <text x="22" y="55" textAnchor="end" fontSize="8" fill="#9aa3b2">Cons: {(selected.cur.scores?.[5]||0)}</text>
                </svg>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
