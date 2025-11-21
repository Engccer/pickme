import csv

# UTF-8 BOM이 포함된 CSV 파일 생성
with open('students.csv', 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['학년', '반', '번호', '이름', '성별', 'screet-pick'])
