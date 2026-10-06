TC=3.45
ENC=0.032; DEL=0.7*0.0008+0.3*0.001; ST=0.003
CF_DEL=0.001; CF_ST=0.005
IGV=1.18
def mux(mins, viewers, conc, rep_viewers=0, rep_min=0, dias=30, enc=True):
    vm=mins*viewers*conc + rep_viewers*rep_min
    c=(mins*ENC if enc else 0)+vm*DEL+mins*ST*dias/30
    return c, vm
def cf(mins, viewers, conc, rep_viewers=0, rep_min=0):
    vm=mins*viewers*conc + rep_viewers*rep_min
    return vm*CF_DEL+mins*CF_ST
def fee(ticket, pct, fijo): return (ticket*pct+fijo)*IGV
print("== 1. Cumpleaños (paga los padres)")
for h,inv,p_t,p_c in [(1,15,15,49),(2,15,25,79),(2,25,30,99)]:
    c,vm=mux(h*60,inv,0.6,inv*0.4,15)
    cc=cf(h*60,inv,0.6,inv*0.4,15)
    print(f" {h}h {inv} inv: min-vistos {vm:.0f} | costo Mux ${c:.2f}=S/{c*TC:.2f} (Cloudflare ${cc:.2f}=S/{cc*TC:.2f}) | plataforma cobra S/{p_t} margen {(p_t-c*TC)/p_t*100:.0f}% | padres pagan S/{p_c} tienda gana S/{p_c-p_t}")
print("== 3. Promoción: S/10 por invitado virtual")
for inv in (40,60,100):
    mins=240; c,vm=mux(mins,inv,0.55,inv*0.4,30)
    bruto=inv*10; plat=inv*3
    print(f" {inv} inv 4h: costo S/{c*TC:.2f} | recaudado S/{bruto} | plataforma S/3 c/u = S/{plat} margen {(plat-c*TC)/plat*100:.0f}% | organizador S/{bruto-plat}")
print("== 4. Deporte escolar: ticket S/4 por padre (partido 2h)")
for t in (4,5):
  for compr in (40,80,150):
    c,vm=mux(120,compr,0.7)
    y=fee(t,0.0299,0.30); k=fee(t,0.0399,0.60)
    mix=0.8*y+0.2*k
    plat=0.25*t
    neto_col=t-plat-mix
    print(f" ticket S/{t} {compr} compras: comisión pasarela S/{mix:.2f} ({mix/t*100:.0f}%) | costo video S/{c*TC:.2f} | plataforma S/{plat*compr:.0f} -> gana S/{plat*compr-c*TC:.2f} | colegio S/{neto_col*compr:.0f}")
  print(f"  abono 8 partidos S/{t*8-4}: comisión S/{0.8*fee(t*8-4,0.0299,0.30)+0.2*fee(t*8-4,0.0399,0.60):.2f}")
print("== 5. Cancha: S/50 por video del partido + jugadas, 1 mes")
c,vm=mux(60,14,0,14*2,20,dias=30)
cc=cf(60,14,0,28,20)
print(f" costo Mux ${c:.2f}=S/{c*TC:.2f} (Cloudflare S/{cc*TC:.2f}) | plataforma cobra S/15 margen {(15-c*TC)/15*100:.0f}% | cancha gana S/35 por partido")
print(f"  20 partidos/semana -> {20*4} al mes: plataforma S/{80*15} costo S/{80*c*TC:.0f}; cancha S/{80*35}")
