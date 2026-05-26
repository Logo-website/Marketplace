FROM gcc:13

WORKDIR /app

COPY . .

RUN g++ -O2 -o recommender main.cpp -lpthread

CMD ["./recommender"]