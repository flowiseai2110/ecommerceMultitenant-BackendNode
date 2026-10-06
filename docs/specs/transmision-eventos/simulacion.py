import random, math
random.seed(2110)
TC=3.45
# Costos (USD)
ENC=0.032; D720=0.0008; D1080=0.001; SIMUL=0.02; ST1080=0.003; R2GB=0.015
FREE_DELIV=100_000; CREDITO=20.0
# Precios a la tienda (S/)
P_HORA=25; P_EXC=35; P_PREMIUM=40; P_SIMUL_H=8; P_GUARDAR=50
FACT={25:0.7,50:1,100:1.6,200:2.8}
# (nombre, ciudad, plan, horas, invitados_virtuales, tope, picos[(min_inicio,dur,frac)], extension_min, destinos, guardar1año, precio_cliente S/)
E=[
("Cumpleaños 2 años de Mateo","Lima (Los Olivos)","privado",3,32,50,[(60,20,.85),(150,15,.80)],0,0,False,180),
("Baby shower de Ana","Arequipa","privado",2,18,25,[(45,25,.75)],0,0,False,120),
("Quinceañero de Valeria","Trujillo","premium",5,85,100,[(30,30,.80),(150,20,.85),(240,20,.60)],0,2,False,450),
("Boda de Lucía y Diego","Cusco","premium",6,140,200,[(20,60,.85),(200,30,.70),(300,20,.50)],60,2,True,650),
("Bautizo de Thiago","Huancayo","basico",2,25,25,[(30,40,.80)],0,0,False,60),
("Misa de honras de Don Julio","Piura","privado",2,70,100,[(0,60,.85)],0,0,True,200),
("Fiesta de promoción del colegio","Lima (Surco)","premium",4,170,200,[(30,40,.75),(120,30,.55)],0,1,False,500),
("Bodas de oro de los abuelos","Chiclayo","privado",4,45,50,[(40,40,.85),(150,20,.70)],30,0,True,250),
("Primera comunión de Camila","Ica","privado",2,35,50,[(20,45,.80)],0,0,False,150),
("Fiesta patronal Virgen de la Candelaria","Puno","privado",4,95,100,[(60,30,.70),(180,30,.65)],30,0,False,300),
]
def curva(mins,picos):
    out=[]
    for t in range(mins):
        if t<20: f=0.15+0.30*t/20
        elif t>mins*0.85: f=0.40*(1-(t-mins*0.85)/(mins*0.15))+0.08
        else: f=0.40
        for s,d,p in picos:
            if s<=t<s+d: f=max(f,p)
        f*=random.uniform(0.9,1.1)
        out.append(min(f,1.0))
    return out
rows=[];tot_deliv=0;tot=dict(ing=0,cost_free=0,cost_full=0,enc=0)
det=[]
for (n,c,plan,h,inv,tope,picos,ext,dest,g1,pcli) in E:
    mins=h*60+ext
    if plan=="basico":
        det.append(dict(n=n,c=c,plan=plan,h=h,ext=ext,inv=inv,tope=tope,pico=0,vm=0,cost=0,costf=0,ing=0,pcli=pcli,unid=0,enc=0,deliv=0,sim=0,st=0,r2=0,rep=0))
        continue
    cur=curva(mins,picos)
    conectados=[round(inv*f) for f in cur]
    vm=sum(conectados); pico=max(conectados)
    rep_frac,rep_min,dias=(0.40,25,30) if plan=="privado" else (0.50,40,90)
    if g1: dias=365
    rep_vm=inv*rep_frac*rep_min
    deliv_vm=vm+rep_vm
    deliv_cost=deliv_vm*(0.7*D720+0.3*D1080)
    enc=mins*ENC
    sim=mins*SIMUL*dest
    st=mins*ST1080*(dias/30)
    gb=5e6*mins*60/8/1e9
    r2=gb*R2GB*((12 if (plan=="premium" or g1) else 1))
    costo_full=enc+deliv_cost+sim+st+r2
    unid=h*FACT[tope]; unid_ext=(ext/60)*FACT[tope]
    ing=unid*P_HORA+unid_ext*P_EXC
    if plan=="premium": ing+=P_PREMIUM+dest*P_SIMUL_H*(mins/60)
    if g1: ing+=P_GUARDAR
    pcli=250+100*max(0,mins/60-2)+(150 if plan=="premium" else 0)+(80 if g1 else 0)
    det.append(dict(n=n,c=c,plan=plan,h=h,ext=ext,inv=inv,tope=tope,pico=pico,vm=vm,deliv=deliv_cost,deliv_vm=deliv_vm,enc=enc,sim=sim,st=st,r2=r2,cost=costo_full,ing=ing,pcli=pcli,unid=unid+unid_ext,rep=rep_vm))
# Escenario con capa gratis: entrega gratis hasta 100k, y $20 de crédito
tot_vm=sum(d.get('deliv_vm',0) for d in det)
tot_full=sum(d['cost'] for d in det)
tot_deliv=sum(d['deliv'] for d in det)
cost_free=max(0,tot_full-tot_deliv-CREDITO)  # supone <100k min
ing=sum(d['ing'] for d in det)
print(f"{'Evento':40} {'plan':8} {'h':>4} {'inv':>4} {'pico':>4} {'min-vistos':>10} {'unid':>5} {'costoUS$':>8} {'costoS/':>8} {'ingreso S/':>10} {'margen':>7} {'cliente S/':>10} {'tienda gana':>11}")
for d in det:
    cs=d['cost']*TC; m=(d['ing']-cs)/d['ing']*100 if d['ing'] else 0
    print(f"{d['n'][:40]:40} {d['plan']:8} {d['h']+d['ext']/60:4.1f} {d['inv']:4} {d['pico']:4} {d['vm']:10,.0f} {d['unid']:5.2f} {d['cost']:8.2f} {cs:8.2f} {d['ing']:10.2f} {m:6.0f}% {d['pcli']:10} {d['pcli']-d['ing']:11.2f}")
print("minutos entregados total (vivo+repetición):",round(tot_vm))
print("ingreso plataforma S/",round(ing,2))
print("costo SIN capa gratis US$",round(tot_full,2),"S/",round(tot_full*TC,2),"margen",round((ing-tot_full*TC)/ing*100,1))
print("costo CON capa gratis US$",round(cost_free,2),"S/",round(cost_free*TC,2),"margen",round((ing-cost_free*TC)/ing*100,1))
print("cliente final total S/",sum(d['pcli'] for d in det),"tienda gana",round(sum(d['pcli']-d['ing'] for d in det),2))
for k in ['enc','deliv','sim','st','r2']: print(k, round(sum(d[k] for d in det),2))
