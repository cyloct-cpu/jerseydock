# 第二版符号形状自检：球衣剪影(A) / V领衣身(B) / 竖条纹(C)
def inside(px, py, poly):
    n=len(poly); c=False; j=n-1
    for i in range(n):
        xi,yi=poly[i]; xj,yj=poly[j]
        if ((yi>py)!=(yj>py)) and (px < (xj-xi)*(py-yi)/(yj-yi)+xi):
            c=not c
        j=i
    return c

def in_rect(px,py,r):
    return r[0]<=px<=r[0]+r[2] and r[1]<=py<=r[1]+r[3]

def render(title, test, W=56, H=28):
    print(f"--- {title} ---")
    for row in range(H):
        yy=240*(row+0.5)/H; line=""
        for col in range(W):
            xx=240*(col+0.5)/W
            line += "#" if test(xx,yy) else " "
        print(line)
    print()

# A 球衣剪影（带袖）
A=[(100,52),(120,72),(140,52),(180,64),(188,108),(164,116),(164,200),(76,200),(76,116),(52,108),(60,64)]
render("A 球衣剪影(带袖, 填充)", lambda x,y: inside(x,y,A))

# B V领衣身（无袖）
B=[(60,80),(100,80),(120,100),(140,80),(180,80),(180,200),(60,200)]
render("B V领衣身(无袖)", lambda x,y: inside(x,y,B))

# C 竖条纹（三条）
stripes=[(66,64,22,132),(109,64,22,132),(152,64,22,132)]
render("C 竖条纹(3条)", lambda x,y: any(in_rect(x,y,r) for r in stripes))
