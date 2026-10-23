# 符号形状自检：把缺角五边形多边形采样成字符画，确认几何正确
poly = [(120,20),(215.11,89.10),(178.78,200.90),(120,175.90),(61.22,200.90),(24.89,89.10)]

def inside(px, py, poly):
    n = len(poly); x, y = px, py; c = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            c = not c
        j = i
    return c

W, H = 56, 28  # 字符画网格（宽>高以补偿字符纵横比）
lines = []
for row in range(H):
    yy = 240 * (row + 0.5) / H
    line = ""
    for col in range(W):
        xx = 240 * (col + 0.5) / W
        line += "#" if inside(xx, yy, poly) else " "
    lines.append(line)
print("SYMBOL SHAPE (should read as a pentagon with a V notch at bottom edge):")
for l in lines:
    print(l)
