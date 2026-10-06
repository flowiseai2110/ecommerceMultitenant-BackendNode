TC=3.45
CF_ST=0.005/1   # $ por minuto almacenado al mes (5 por 1000)
CF_DEL=0.001    # $ por minuto entregado
IGV=1.18
def yape(m): return (m*0.0299+0.30)*IGV
horas_mes=6*30            # 6 h de partidos al día
partidos=horas_mes        # partidos de 1 h
min_grab=horas_mes*60
print("Una cancha, 6 partidos al día =",partidos,"partidos/mes")
for pct_vendido in (0.10,0.25,0.40):
    vend=partidos*pct_vendido
    # almacenamiento: vendidos 30 días; no vendidos 3 días
    st_min_mes=vend*60*1 + (partidos-vend)*60*(3/30)
    st=st_min_mes*CF_ST
    # entrega: video vendido visto por 8 personas x 15 min; jugadas: 4 clips x 30 s x 20 vistas en todos los partidos
    deliv=vend*8*15*CF_DEL + partidos*4*0.5*20*CF_DEL
    costo=(st+deliv)*TC
    print(f"\n vendidos {pct_vendido:.0%} ({vend:.0f} videos): costo nube S/{costo:.0f}/mes (almac. S/{st*TC:.0f}, entrega S/{deliv*TC:.0f})")
    # Modelo A: suscripción
    a=299; print(f"  A) suscripción S/{a}/mes -> margen {(a-costo)/a:.0%}")
    # Modelo B: cuota baja + venta de videos (S/15 partido, reparto 50/50) + jugadas S/3
    cuota=99; precio_v=15; jug_vend=partidos*0.5   # medio clip pagado por partido
    ventas=vend*precio_v + jug_vend*3
    com=vend*yape(precio_v)+jug_vend*yape(3)
    plat=cuota+0.5*(ventas-com)
    print(f"  B) S/{cuota}/mes + 50% de ventas (S/{ventas:.0f} brutas, comisión S/{com:.0f}) -> plataforma S/{plat:.0f}, margen {(plat-costo)/plat:.0%}; cancha recibe S/{0.5*(ventas-com):.0f}")
# Empresa: S/50 por partido (video + jugadas, 1 mes)
print("\n Paquete empresa S/50: costo por video ~S/", round((60*CF_ST + 15*20*CF_DEL + 6*0.5*30*CF_DEL)*TC,2), "comisión Yape S/", round(yape(50),2))
