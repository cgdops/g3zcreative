import React from 'react';
import { Box, Container, Typography, Button, Grid, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';

const HeroSection = styled(Box)(({ theme }) => ({
  background: '#f8f8f8',
  /*background: `linear-gradient(45deg, ${theme.palette.primary.main} 30%, ${theme.palette.secondary.main} 90%)`,*/
  color: 'black',
  padding: theme.spacing(15, 0),
  textAlign: 'center',
  '& h1': {
    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    fontWeight: 'bold',
    marginBottom: theme.spacing(3)
  }
}));

const ServiceCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  transition: 'transform 0.3s ease-in-out',
  '&:hover': {
    transform: 'translateY(-10px)'
  }
}));

function Home() {
  const services = [
    {
      title: 'Web Development',
      description: 'Custom, responsive websites that drive results',
      benefit: 'Boost Your Online Presence'
    },
    {
      title: 'SEO',
      description: 'Data-driven optimization for better visibility',
      benefit: 'Increase Your Traffic'
    },
    {
      title: 'Copywriting',
      description: 'Compelling content that converts',
      benefit: 'Engage Your Audience'
    },
    {
      title: 'Graphic Design',
      description: 'Visual elements that tell your story',
      benefit: 'Build a Memorable Brand'
    }
  ];

  return (
    <Box>
      <HeroSection>
        <Container>
          <Typography variant="h1" gutterBottom>
            Full-Service Web & Marketing Solutions to Elevate Your Brand
          </Typography>
          <Typography variant="h5" paragraph>
            Transform your online presence with expert web development, SEO, copywriting, and design services
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            sx={{ mt: 4 }}
          >
            Schedule a Free Consultation
          </Button>
        </Container>
      </HeroSection>

      <Container sx={{ py: 8 }}>
        <Typography variant="h2" align="center" gutterBottom>
          Our Services
        </Typography>
        <Grid container spacing={4} sx={{ mt: 4 }}>
          {services.map((service) => (
            <Grid item xs={12} sm={6} md={3} key={service.title}>
              <ServiceCard elevation={3}>
                <Typography variant="h5" gutterBottom>
                  {service.title}
                </Typography>
                <Typography color="textSecondary" paragraph>
                  {service.description}
                </Typography>
                <Typography variant="subtitle1" color="primary" sx={{ mt: 'auto' }}>
                  {service.benefit}
                </Typography>
              </ServiceCard>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

export default Home;